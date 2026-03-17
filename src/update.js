#!/usr/bin/env node

/**
 * Awesome Trending Repos - Update Script
 *
 * Fetches trending repositories, compares with historical data,
 * enriches with insights, and updates README.md
 */

import { promises as fs } from 'fs';
import { resolve } from 'path';
import { fetchGitHubTrending, fetchMultiLanguageTrending, POPULAR_LANGUAGES } from './data-sources/github-trending.js';
import { searchTrendingRepos as searchGitHubTrending } from './data-sources/github-search.js';
import { generateInsights, generateHistoricalComparison, generateTrendAnalysis } from './utils/insights.js';
import { filterPopularLanguages, limitToTop } from './utils/insights.js';
import { generateTrendingTable, generateInsightsSection, generateLanguageBreakdown, generateComparisonSection, generateTrendGraphs } from './utils/markdown.js';
import { updateReadme, readReadme } from './utils/readme.js';

// Data storage paths
const DATA_DIR = resolve('.data');
const HISTORY_FILE = resolve(DATA_DIR, 'history.json');
const SNAPSHOT_DIR = resolve(DATA_DIR, 'snapshots');

// Configuration
const CONFIG = {
  maxRepos: 50,
  fallbackToSearch: true,
  filterLanguages: true,
  includeInsights: true,
  includeLanguageBreakdown: true,
  includeHistoricalComparison: true,
  includeTrendGraphs: true,
  historyDays: 7 // Keep 7 days of history
};

/**
 * Ensure data directory exists
 */
async function ensureDataDir() {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.mkdir(SNAPSHOT_DIR, { recursive: true });
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
    return JSON.parse(content);
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
 * Save daily snapshot
 */
async function saveSnapshot(repos, date) {
  await ensureDataDir();
  const filename = `${date.toISOString().split('T')[0]}.json`;
  const filepath = resolve(SNAPSHOT_DIR, filename);
  await fs.writeFile(filepath, JSON.stringify(repos, null, 2), 'utf-8');
}

/**
 * Load snapshot for a specific date
 */
async function loadSnapshot(date) {
  const filename = `${date.toISOString().split('T')[0]}.json`;
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
 */
async function cleanupOldSnapshots() {
  try {
    const files = await fs.readdir(SNAPSHOT_DIR);
    const now = new Date();

    for (const file of files) {
      const filepath = resolve(SNAPSHOT_DIR, file);
      const stats = await fs.stat(filepath);
      const daysSinceModified = (now - stats.mtime) / (1000 * 60 * 60 * 24);

      if (daysSinceModified > CONFIG.historyDays) {
        await fs.unlink(filepath);
      }
    }
  } catch (error) {
    console.warn('  ⚠️ Could not clean up old snapshots');
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
    repos = await fetchMultiLanguageTrending(POPULAR_LANGUAGES);
    dataSource = 'GitHub Trending';

    // Fallback to GitHub Search API
    if (repos.length === 0 && CONFIG.fallbackToSearch) {
      console.log('  Falling back to GitHub Search API...');
      repos = await searchGitHubTrending({
        languages: ['javascript', 'typescript', 'python', 'go', 'rust', 'java'],
        resultsPerLanguage: 10
      });
      dataSource = 'GitHub Search API';
    }

    if (repos.length === 0) {
      throw new Error('No repositories found from any data source');
    }

    console.log(`  ✅ Found ${repos.length} repositories from ${dataSource}\n`);

    // Step 2: Filter by popular languages
    if (CONFIG.filterLanguages) {
      console.log('🏷️ Filtering by popular languages...');
      repos = filterPopularLanguages(repos);
      console.log(`  ✅ ${repos.length} repositories after filtering\n`);
    }

    // Step 3: Limit to top N
    console.log(`✂️ Limiting to top ${CONFIG.maxRepos} repositories...`);
    repos = limitToTop(repos, CONFIG.maxRepos);
    console.log(`  ✅ Retained ${repos.length} repositories\n`);

    // Step 4: Compare with historical data
    let historicalComparison = null;
    let trendAnalysis = null;

    if (previousSnapshot && CONFIG.includeHistoricalComparison) {
      console.log('📊 Comparing with previous data...');
      const previousRepos = previousSnapshot.repos;
      historicalComparison = generateHistoricalComparison(repos, previousRepos);
      trendAnalysis = generateTrendAnalysis(repos, previousRepos, history.snapshots);

      console.log(`  📈 New entrants: ${historicalComparison.newEntrants.length}`);
      console.log(`  📉 Dropped: ${historicalComparison.dropped.length}`);
      console.log(`  ⏫ Climbers: ${historicalComparison.movers.up.length}`);
      console.log(`  ⏬ Fallers: ${historicalComparison.movers.down.length}\n`);
    }

    // Step 5: Generate insights
    const insights = generateInsights(repos);
    console.log(`📊 Generated insights:`);
    console.log(`  - Rising Star: ${insights.risingStar.owner}/${insights.risingStar.name} (+${formatNumber(insights.risingStar.growth)} stars)`);
    console.log(`  - Top Languages: ${insights.topLanguages.map(l => l.language).join(', ')}`);
    console.log(`  - Total Stars: ${formatNumber(insights.totalStars)}\n`);

    // Step 6: Save snapshot
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
    await saveSnapshot(repos, now);

    // Update history
    history.snapshots.unshift(snapshot);
    history.lastUpdate = now.toISOString();

    // Keep only recent history in memory file
    history.snapshots = history.snapshots.slice(0, CONFIG.historyDays);
    await saveHistory(history);
    await cleanupOldSnapshots();
    console.log('  ✅ Snapshot saved\n');

    // Step 7: Generate markdown content
    console.log('📝 Generating markdown content...');
    const lastUpdated = now.toUTCString();

    let markdownContent = `## 📈 Today's Trending Repositories

> _Last updated: **${lastUpdated}** | Data source: **${dataSource}** | Repositories: **${repos.length}**

`;

    // Add trending table
    markdownContent += generateTrendingTable(repos);
    markdownContent += '\n';

    // Add historical comparison
    if (historicalComparison && CONFIG.includeHistoricalComparison) {
      markdownContent += generateComparisonSection(historicalComparison);
    }

    // Add trend graphs
    if (trendAnalysis && CONFIG.includeTrendGraphs) {
      markdownContent += generateTrendGraphs(trendAnalysis, repos);
    }

    // Add insights section
    if (CONFIG.includeInsights) {
      markdownContent += generateInsightsSection(insights);
    }

    // Add language breakdown
    if (CONFIG.includeLanguageBreakdown) {
      markdownContent += generateLanguageBreakdown(repos);
    }

    console.log('  ✅ Markdown content generated\n');

    // Step 8: Update README
    console.log('📄 Updating README.md...');
    const result = await updateReadme(markdownContent);

    if (result.created) {
      console.log('  ✅ README.md created\n');
    } else if (result.modified) {
      console.log('  ✅ README.md updated\n');
    } else {
      console.log('  ℹ️ No changes needed - README already up to date\n');
    }

    // Summary
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log('✨ Update completed successfully!');
    console.log(`⏱️ Elapsed time: ${elapsed}s`);
    console.log(`📦 Repositories processed: ${repos.length}`);
    console.log(`📝 README ${result.created ? 'created' : result.modified ? 'updated' : 'unchanged'}`);

    return {
      success: true,
      reposCount: repos.length,
      readmeUpdated: result.modified || result.created,
      dataSource,
      elapsed,
      historicalComparison
    };

  } catch (error) {
    console.error('\n❌ Error during update:');
    console.error(`  ${error.message}`);

    // On error, preserve last known good data
    try {
      const existingReadme = await readReadme();
      if (existingReadme) {
        console.log('\n⚠️ Preserving existing README content (last known good state)');
      }
    } catch {
      console.log('\n⚠️ Could not read existing README');
    }

    throw error;
  }
}

/**
 * Format number with K/M suffix
 */
function formatNumber(num) {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num.toString();
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
