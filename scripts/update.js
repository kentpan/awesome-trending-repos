#!/usr/bin/env node

/**
 * Awesome Trending Repos - Update Script
 *
 * Fetches trending repositories, compares with historical data,
 * enriches with insights, and updates README.md
 */

import { promises as fs } from 'fs';
import { resolve } from 'path';
import { fetchTrendingWithEnrichment, pusherTrending } from './data-sources/github-trending.js';
import { searchTrendingRepos as searchGitHubTrending, getBatchAvatars } from './data-sources/github-search.js';
import * as utils from './utils.js';
import { CONFIG, TRENDING_LANGUAGES, PUSHER_APIS } from './config.js';

// Data storage paths
const DATA_DIR = resolve('.data');
const HISTORY_FILE = resolve(DATA_DIR, 'history.json');
const SNAPSHOT_DIR = resolve(DATA_DIR, 'snapshots');
const PUBLIC_DATA_DIR = resolve('public', 'data');
const TRENDING_JSON = resolve(PUBLIC_DATA_DIR, 'trending.json');
const FEED_JSON = resolve(PUBLIC_DATA_DIR, 'feed.json');

// CLI 参数: --dry-run 只抓取和校验, 不写文件、不推送
const CLI_ARGS = new Set(process.argv.slice(2));
const DRY_RUN = CLI_ARGS.has('--dry-run');
const SKIP_PUSH = CLI_ARGS.has('--no-push') || process.env.SKIP_PUSH === '1';
// 抓取不到足够"当日新数据"时的底线, 低于该值直接报错而不是拿历史数据凑数
const MIN_FRESH_REPOS = Number(process.env.MIN_FRESH_REPOS || 3);

const SNAPSHOT_FILE_RE = /^(\d{4})-(\d{2})-(\d{2})\.json$/;

/**
 * 输出 GitHub Actions 注解, 让警告/错误在 Actions 页面直接可见
 */
function annotate(type, message) {
  const line = type === 'error' ? `::error::${message}` : `::warning::${message}`;
  console.log(line);
}

/**
 * Update deployment feed
 */
async function updateFeed(snapshot) {
  try {
    let feed = [];
    try {
      const content = await fs.readFile(FEED_JSON, 'utf-8');
      feed = JSON.parse(content);
    } catch (e) {
      // Start new feed
    }

    const newEntry = {
      id: Date.now().toString(),
      date: snapshot.date,
      title: `Daily Update: ${snapshot.repos.length} repos curated`,
      summary: `Top languages today: ${snapshot.insights.topLanguages.map(l => l.language).join(', ')}. Rising star: ${snapshot.insights.risingStar.name}.`,
      type: 'update'
    };

    feed.unshift(newEntry);
    // Keep last 20 entries
    feed = feed.slice(0, 20);
    
    await fs.writeFile(FEED_JSON, JSON.stringify(feed, null, 2), 'utf-8');
  } catch (error) {
    console.warn('  ⚠️ Could not update feed:', error.message);
  }
}

/**
 * Ensure data directory exists
 */
async function ensureDataDir() {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.mkdir(SNAPSHOT_DIR, { recursive: true });
    await fs.mkdir(PUBLIC_DATA_DIR, { recursive: true });
  } catch (error) {
    // Ignore if already exists
  }
}

/**
 * Load historical data
 */
async function loadHistory() {
  try {
    const content = await fs.readFile(HISTORY_FILE, 'utf-8');
    const history = JSON.parse(content);
    // Validate history structure
    if (!history.snapshots || !Array.isArray(history.snapshots)) {
      console.warn('  ⚠️ Invalid history format, starting fresh');
      return { snapshots: [], lastUpdate: null };
    }
    return history;
  } catch (error) {
    return { snapshots: [], lastUpdate: null };
  }
}

/**
 * Save historical data
 */
async function saveHistory(history) {
  await ensureDataDir();
  await fs.writeFile(HISTORY_FILE, JSON.stringify(history, null, 2), 'utf-8');
}

/**
 * 生成快照文件名用的日期 key (YYYY-MM-DD)
 *
 * 统一按站点所在时区 UTC+8 计算, 否则本地晚上跑脚本会写成"昨天"的文件名
 * (toISOString 是 UTC, 北京时间 03:00 会被算成前一天)。
 * CI 里是 00:01 UTC = 08:01 CST, 两种算法结果一致, 不影响历史文件名。
 */
function toDateKey(date = new Date()) {
  const beijing = new Date(date.getTime() + 8 * 60 * 60 * 1000);
  return beijing.toISOString().slice(0, 10);
}

/**
 * Save daily snapshot
 */
async function saveSnapshot(repos, date) {
  await ensureDataDir();
  const filename = `${toDateKey(date)}.json`;
  const filepath = resolve(SNAPSHOT_DIR, filename);
  await fs.writeFile(filepath, JSON.stringify(repos, null, 2), 'utf-8');
}

/**
 * Load snapshot for a specific date
 */
async function loadSnapshot(date) {
  const filename = `${toDateKey(date)}.json`;
  const filepath = resolve(SNAPSHOT_DIR, filename);
  try {
    const content = await fs.readFile(filepath, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    return null;
  }
}

/**
 * Clean up old snapshots
 *
 * 必须按"文件名里的日期"判断, 不能用 mtime。
 * 之前用 stats.mtime, 在任何非 checkout 环境(本地拉代码、解压 zip)下跑一次,
 * 就会把 .data/snapshots 里所有快照全部删掉(本次事故: 本地 44 个快照被清空)。
 */
async function cleanupOldSnapshots() {
  try {
    const retentionDays = CONFIG.snapshotRetentionDays || 0;
    // 0 / 负数 = 不清理, 历史快照全部保留
    if (retentionDays <= 0) return;

    const files = await fs.readdir(SNAPSHOT_DIR);
    const now = Date.now();
    const maxAgeMs = retentionDays * 24 * 60 * 60 * 1000;
    let removed = 0;

    for (const file of files) {
      const matched = SNAPSHOT_FILE_RE.exec(file);
      // 只处理规范的日期文件, 其它文件一律不碰
      if (!matched) continue;

      const fileTime = Date.UTC(Number(matched[1]), Number(matched[2]) - 1, Number(matched[3]));
      if (!Number.isFinite(fileTime)) continue;

      if (now - fileTime > maxAgeMs) {
        await fs.unlink(resolve(SNAPSHOT_DIR, file));
        removed++;
      }
    }

    if (removed) {
      console.log(`  🧹 清理过期快照 ${removed} 个 (保留最近 ${retentionDays} 天)`);
    }
  } catch (error) {
    console.warn(`  ⚠️ Could not clean up old snapshots: ${error.message}`);
  }
}

/**
 * Main execution function
 */
async function main() {
  const startTime = Date.now();
  const now = new Date();
  console.log('🚀 Awesome Trending Repos - Update Script');
  console.log(`Started at: ${now.toISOString()}\n`);

  // Validate configuration
  const configValidation = utils.validateConfig(CONFIG);
  if (!configValidation.valid) {
    throw new Error('Invalid configuration');
  }

  let repos = [];
  let dataSource = '';

  try {
    // Step 0: Load historical data
    console.log('📂 Loading historical data...');
    const history = await loadHistory();
    const previousSnapshot = history.snapshots[0] || null;

    if (previousSnapshot) {
      const lastUpdate = new Date(previousSnapshot.date);
      const hoursAgo = Math.floor((now - lastUpdate) / (1000 * 60 * 60));
      console.log(`  ℹ️ Last update: ${hoursAgo} hours ago (${lastUpdate.toISOString()})`);
      console.log(`  ℹ️ Previous repos: ${previousSnapshot.repos.length}\n`);
    } else {
      console.log('  ℹ️ No previous data found - starting fresh\n');
    }

    // Step 1: Fetch trending repositories
    console.log('📡 Fetching trending repositories...');

    // Primary: GitHub trending page scraping
    console.log('  Using GitHub trending page scraping...');
    try {
      repos = await fetchTrendingWithEnrichment({ languages: TRENDING_LANGUAGES });
      dataSource = 'GitHub Trending';
    } catch (error) {
      // 抓取整体失败时不能直接退出, 后面还有 Search API 兜底
      console.error(`  ❌ GitHub Trending 抓取失败: ${error.message}`);
      repos = [];
      dataSource = 'GitHub Trending(抓取失败)';
    }

    // Supplement with GitHub Search API if needed
    if (repos.length < CONFIG.maxRepos && CONFIG.fallbackToSearch) {
      console.log(`  Supplementing with GitHub Search API (${repos.length} found, target: ${CONFIG.maxRepos})...`);

      try {
        const searchResults = await searchGitHubTrending({
          languages: ['javascript', 'typescript', 'python', 'go', 'rust', 'java', 'c++', 'ruby', 'php'],
          resultsPerLanguage: 10
        });

        // Add unique repos from search results
        const currentKeys = new Set(repos.map(r => `${r.owner}/${r.name}`));
        for (const repo of searchResults) {
          const key = `${repo.owner}/${repo.name}`;
          if (!currentKeys.has(key) && repos.length < CONFIG.maxRepos) {
            repos.push({
              ...repo,
              starsToday: Math.floor((repo.stars || 10000) * 0.01), // Estimate growth
              growth: Math.floor((repo.stars || 10000) * 0.01),
              rank: repos.length + 1
            });
            currentKeys.add(key);
          }
        }

        if (searchResults.length > 0) {
          dataSource += ' + GitHub Search';
        }

        // Sort by starsToday (desc) then by total stars
        repos.sort((a, b) => (b.starsToday || 0) - (a.starsToday || 0) || b.stars - a.stars);
      } catch (searchError) {
        console.warn(`  ⚠️ Search API failed: ${searchError.message}`);
      }
    }

    if (repos.length === 0) {
      throw new Error('抓取失败: GitHub Trending 与 Search API 都没有返回任何仓库, 请检查网络 / GITHUB_TOKEN / GitHub 是否限流');
    }

    console.log(`  ✅ Found ${repos.length} repositories from ${dataSource}\n`);

    // Step 2: Validate data
    console.log('🔍 Validating repository data...');
    const validation = utils.filterValidRepos(repos);
    repos = validation.valid;
    if (validation.invalid > 0) {
      console.log(`  ⚠️ 丢弃 ${validation.invalid} 个字段不完整的仓库`);
    }
    console.log(`  ✅ ${repos.length} valid repositories\n`);

    // Step 3: Filter by popular languages
    if (CONFIG.filterLanguages) {
      console.log('🏷️ Filtering by popular languages...');
      repos = utils.filterPopularLanguages(repos);
      console.log(`  ✅ ${repos.length} repositories after filtering\n`);
    }

    // 当日真实数据量校验: 低于底线直接报错, 绝不能悄悄用历史数据顶上
    const freshCount = repos.length;
    if (freshCount < MIN_FRESH_REPOS) {
      throw new Error(
        `抓取数据不足: 只拿到 ${freshCount} 个有效仓库 (下限 ${MIN_FRESH_REPOS} 个), ` +
        '大概率是 GitHub 抓取失败或被限流。已中止本次更新, 避免把历史数据当成今日数据写入。'
      );
    }

    // Step 4: Augment with historical data if needed
    if (repos.length < CONFIG.maxRepos && history.snapshots.length > 0) {
      console.log(`📜 Augmenting with historical data (target: ${CONFIG.maxRepos})...`);

      const currentKeys = new Set(repos.map(r => `${r.owner}/${r.name}`));
      const historicalRepos = [];

      for (const snapshot of history.snapshots.slice(1)) {
        for (const repo of snapshot.repos) {
          const key = `${repo.owner}/${repo.name}`;
          if (!currentKeys.has(key) && repo.language) {
            historicalRepos.push({
              ...repo,
              starsToday: Math.floor((repo.starsToday || 0) * 0.5) || 0,
              growth: Math.floor((repo.starsToday || 0) * 0.5) || 0,
              isHistorical: true
            });
            currentKeys.add(key);
          }
        }

        if (repos.length + historicalRepos.length >= CONFIG.maxRepos) {
          break;
        }
      }

      historicalRepos.sort((a, b) => b.stars - a.stars);
      repos = [...repos, ...historicalRepos.slice(0, CONFIG.maxRepos - repos.length)];
      console.log(`  ✅ Augmented to ${repos.length} repositories (其中 ${repos.length - freshCount} 条为历史补全)`);
      annotate('warning', `今日仅抓到 ${freshCount} 条新数据, 有 ${repos.length - freshCount} 条为历史补全`);
      console.log('');
    }

    // Step 5: Enrichment - Skipped as requested (focus on Top Repos)

    // Step 6: Limit to top N
    console.log(`✂️ Limiting to top ${CONFIG.maxRepos} repositories...`);
    repos = repos.slice(0, CONFIG.maxRepos);
    console.log(`  ✅ Retained ${repos.length} repositories\n`);

    // merge user avatar
    const owners = [...new Set(repos.map(r => r.owner))];
    const avatars = await getBatchAvatars(owners);
    repos = repos.map(repo => ({
      ...repo,
      avatar: avatars[repo.owner] || repo.avatar || ''
    }));
    console.log(`  ✅ Merged user avatars (${Object.keys(avatars).length}/${owners.length})\n`);

    // Step 7: Compare with historical data
    let historicalComparison = null;
    let trendAnalysis = null;

    if (previousSnapshot && CONFIG.includeHistoricalComparison) {
      console.log('📊 Comparing with previous data...');
      const previousRepos = previousSnapshot.repos;
      historicalComparison = utils.generateHistoricalComparison(repos, previousRepos);
      trendAnalysis = utils.generateTrendAnalysis(repos, previousRepos);
    }

    // Step 8: Generate insights
    const insights = utils.generateInsights(repos);
    console.log(`📊 Generated insights for ${repos.length} repos\n`);

    // Step 9: Save snapshot
    console.log('💾 Saving snapshot...');
    const snapshot = {
      date: now.toISOString(),
      repos,
      insights: {
        risingStar: insights.risingStar,
        topLanguages: insights.topLanguages,
        totalStars: insights.totalStars
      }
    };

    if (DRY_RUN) {
      console.log('  🧪 --dry-run 模式: 跳过写文件与推送');
      console.log(`  即将写入: .data/snapshots/${toDateKey(now)}.json (${repos.length} 条)`);
    } else {
      await saveSnapshot(repos, now);

      // Update history
      history.snapshots.unshift(snapshot);
      history.lastUpdate = now.toISOString();

      // Keep only recent history in memory file
      history.snapshots = history.snapshots.slice(0, CONFIG.historyDays);
      await saveHistory(history);
      await cleanupOldSnapshots();

      // Save for frontend
      console.log('🌐 Saving public data for frontend...');
      await fs.writeFile(TRENDING_JSON, JSON.stringify(snapshot, null, 2), 'utf-8');
      await updateFeed(snapshot);

      console.log('  ✅ Snapshot saved\n');
    }

    // Step 10: Push to Pusher (放在落盘之后, 推送失败不会丢数据)
    let pushResult = { ok: false, skipped: true, results: [] };
    const pusherApis = process.env.PUSHER_APIS
      ? process.env.PUSHER_APIS.split(',').map(api => api.trim()).filter(Boolean)
      : PUSHER_APIS;

    if (DRY_RUN || SKIP_PUSH) {
      console.log('🚀 跳过推送 (dry-run / SKIP_PUSH)');
    } else if (pusherApis.length > 0) {
      console.log('🚀 Pushing to Pusher...', pusherApis.join(', '));
      pushResult = { ...(await pusherTrending(repos, pusherApis)), skipped: false };
      if (!pushResult.ok) {
        annotate('error', `榜单数据推送站点失败: ${pushResult.results.map(r => `${r.api} => ${r.error}`).join(' | ')}`);
      }
    }

    // Step 11: Summary
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log('✨ Update completed successfully!');
    console.log(`⏱️ Elapsed time: ${elapsed}s`);
    console.log(`📦 Repositories processed: ${repos.length} (当日新数据 ${freshCount} 条)`);
    console.log(`🚀 Push: ${pushResult.skipped ? 'skipped' : (pushResult.ok ? 'ok' : 'failed')}`);
    if (!DRY_RUN) console.log(`📝 public/data/trending.json updated`);

    return {
      success: true,
      reposCount: repos.length,
      freshCount,
      dataSource,
      elapsed,
      pushOk: pushResult.ok,
      pushSkipped: pushResult.skipped,
      historicalComparison
    };

  } catch (error) {
    console.error('\n❌ Error during update:');
    console.error(`  ${error.message}`);
    throw error;
  }
}

// CLI execution
if (import.meta.url === `file://${process.argv[1]}`) {
  main()
    .then(result => {
      process.exit(result.success ? 0 : 1);
    })
    .catch(error => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

export { main };
