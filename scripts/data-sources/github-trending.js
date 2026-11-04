/**
 * Fetch trending repositories from GitHub's trending page
 * GitHub trending URL: https://github.com/trending
 *
 * @param {Object} options - Fetch options
 * @param {string} options.language - Filter by programming language
 * @param {string} options.since - Time period: 'daily' (default), 'weekly', 'monthly'
 * @param {string} options.spokenLanguage - Filter by spoken language code
 * @returns {Promise<Array>} Array of trending repositories
 */

import axios from 'axios';
import * as cheerio from 'cheerio';
import { fillMissingLanguages } from './github-enrich.js';
import { TRENDING_LANGUAGES } from '../config.js';

// 抓取失败时的重试配置
const REQUEST_TIMEOUT = Number(process.env.TRENDING_TIMEOUT || 20000);
const MAX_RETRIES = Number(process.env.TRENDING_RETRIES || 3);

// 浏览器 UA 池: GitHub 对非浏览器 UA / 机房 IP 越来越严格, 固定 UA 很容易被 429
const USER_AGENTS = [
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36'
];

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function pickUserAgent() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

/**
 * 抓取地址候选列表: 直连 github.com, 以及可选的自建 GitHub 代理
 * 国内网络直连 github.com 经常 socket hang up, 配置 GITHUB_TRENDING_PROXY 后可走代理
 */
function getTrendingBases() {
  const bases = [{ base: 'https://github.com', extraQuery: {} }];
  const proxy = process.env.GITHUB_TRENDING_PROXY;
  if (proxy) {
    bases.push({
      base: proxy.replace(/\/+$/, ''),
      // 自建代理通过 safepass=1 跳过鉴权
      extraQuery: { safepass: '1' }
    });
  }
  return bases;
}

function buildTrendingUrl(base, extraQuery, language, since, spokenLanguage) {
  let url = `${base}/trending`;
  if (language) url += `/${language}`;

  const params = new URLSearchParams();
  if (since) params.append('since', since);
  if (spokenLanguage) params.append('spoken_language_code', spokenLanguage);
  Object.entries(extraQuery || {}).forEach(([k, v]) => params.append(k, v));

  return params.toString() ? `${url}?${params.toString()}` : url;
}

/**
 * 带重试 + 退避的页面请求
 */
async function fetchPageWithRetry(url, attempt = 1) {
  try {
    const response = await axios.get(url, {
      headers: {
        'User-Agent': pickUserAgent(),
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache'
      },
      timeout: REQUEST_TIMEOUT,
      maxRedirects: 5
    });
    return response.data;
  } catch (error) {
    const status = error.response?.status;
    // 网络类错误 / 限流 / 5xx 才重试, 404 之类直接放弃
    const retryable = !status || status === 429 || status === 403 || status >= 500;
    if (attempt >= MAX_RETRIES || !retryable) throw error;

    const wait = Math.min(10000, 800 * Math.pow(2, attempt - 1)) + Math.floor(Math.random() * 500);
    console.warn(`  ⚠️ 抓取失败(${status || error.code || error.message}), ${Math.round(wait)}ms 后第 ${attempt} 次重试: ${url}`);
    await sleep(wait);
    return fetchPageWithRetry(url, attempt + 1);
  }
}

export async function fetchGitHubTrending(options = {}) {
  const {
    language = '',
    since = 'daily',
    spokenLanguage = ''
  } = options;

  let lastError = null;

  for (const { base, extraQuery } of getTrendingBases()) {
    const url = buildTrendingUrl(base, extraQuery, language, since, spokenLanguage);
    try {
      const html = await fetchPageWithRetry(url);
      return parseTrendingPage(html);
    } catch (error) {
      lastError = error;
      const status = error.response?.status;
      if (status === 404) {
        // 该语言没有 trending 页, 返回空即可
        return [];
      }
      console.warn(`  ⚠️ ${base} 抓取 [${language || 'all'}] 失败: ${status || error.code || error.message}`);
    }
  }

  const status = lastError?.response?.status;
  if (status) throw new Error(`GitHub returned ${status}: ${lastError.response.statusText}`);
  if (lastError?.code === 'ECONNABORTED') {
    throw new Error('Request timeout - GitHub might be rate limiting or slow');
  }
  throw new Error(`Failed to fetch trending: ${lastError?.message || 'unknown error'}`);
}

/**
 * Parse HTML from GitHub trending page
 */
function parseTrendingPage(html) {
  const $ = cheerio.load(html);
  const repos = [];

  // GitHub may use different selectors over time
  const articleSelectors = [
    'article.Box-row',
    'article[class*="Box-row"]',
    'li[class*="repo-list"]',
    '.repo-list-item'
  ];

  let articles = null;
  for (const selector of articleSelectors) {
    articles = $(selector);
    if (articles.length > 0) break;
  }

  if (articles.length === 0) {
    console.warn('  ⚠️ No trending articles found - GitHub may have changed the page structure');
    return [];
  }

  articles.each((index, element) => {
    try {
      const repo = parseArticleElement($, element, index);
      if (repo && repo.owner && repo.name) {
        repos.push(repo);
      }
    } catch (error) {
      console.warn(`  ⚠️ Failed to parse article ${index}: ${error.message}`);
    }
  });

  return repos;
}

/**
 * Parse a single article element
 */
function parseArticleElement($, element, index) {
  const $el = $(element);

  // Extract owner and name from the repository link
  const repoLink = $el.find('h2 a').attr('href') ||
                   $el.find('h1 a').attr('href') ||
                   $el.find('a[href*="/"]').first().attr('href') || '';

  const [, owner, name] = repoLink.match(/^\/([^/]+)\/([^/]+)/) || [];
  if (!owner || !name) return null;

  // Extract description - try multiple selectors
  let description = '';
  const descSelectors = ['p', '.py-1', 'div[itemprop="description"]'];
  for (const selector of descSelectors) {
    const text = $el.find(selector).first().text().trim();
    if (text && text.length > 10) {
      description = text;
      break;
    }
  }

  // Extract programming language - try multiple selectors
  let language = '';
  const langSelectors = [
    '[itemprop="programmingLanguage"]',
    'span[itemprop="programmingLanguage"]',
    '.d-inline-block.ml-0'
  ];
  for (const selector of langSelectors) {
    const text = $el.find(selector).first().text().trim();
    if (text) {
      language = text;
      break;
    }
  }

  // Extract star count
  const starsText = $el.find('a[href*="/stargazers"]').first().text().trim();
  const stars = parseStars(starsText);

  // Extract stars today
  const starsTodayText = $el.find('span.d-inline-block.float-sm-right').text().trim();
  const starsToday = parseStarsToday(starsTodayText);

  // Extract fork count
  const forksText = $el.find('a[href*="/forks"]').first().text().trim();
  const forks = parseStars(forksText);

  // Current period rank (from position in list)
  const rank = index + 1;

  return {
    owner,
    name,
    description,
    language,
    stars,
    forks,
    starsToday,
    growth: starsToday,
    rank,
    url: `https://github.com/${owner}/${name}`,
    fetchedAt: new Date().toISOString(),
    source: 'github-trending'
  };
}

/**
 * Parse star count from text (e.g., "123.4k" -> 123400)
 */
function parseStars(text) {
  if (!text) return 0;

  const cleaned = text.replace(/,/g, '').toLowerCase();

  if (cleaned.endsWith('k')) {
    return Math.floor(parseFloat(cleaned.slice(0, -1)) * 1000);
  }
  if (cleaned.endsWith('m')) {
    return Math.floor(parseFloat(cleaned.slice(0, -1)) * 1000000);
  }

  return parseInt(cleaned, 10) || 0;
}

/**
 * Parse stars today from text (e.g., "123 stars today" -> 123)
 */
function parseStarsToday(text) {
  if (!text) return 0;

  const match = text.match(/(\d+(?:[.,]\d+)?[kKmM]?)\s*stars?\s*today/i);
  if (!match) return 0;

  return parseStars(match[1]);
}

/**
 * Fetch trending for multiple languages and deduplicate
 */
export async function fetchMultiLanguageTrending(languages = ['javascript', 'python']) {
  // Skip empty language string - base trending page seems to have issues
  const filteredLanguages = languages.filter(l => l && l.trim() !== '');

  const results = await Promise.allSettled(
    filteredLanguages.map(lang => fetchGitHubTrending({ language: lang, since: 'daily' }))
  );

  const allRepos = [];
  const seen = new Set();
  let failedCount = 0;

  for (const result of results) {
    if (result.status === 'fulfilled') {
      for (const repo of result.value) {
        const key = `${repo.owner}/${repo.name}`;
        if (!seen.has(key)) {
          seen.add(key);
          allRepos.push(repo);
        }
      }
    } else {
      failedCount++;
      console.warn(`  ⚠️ Failed to fetch trending: ${result.reason.message}`);
    }
  }

  console.log(`  📊 抓取完成: ${filteredLanguages.length - failedCount}/${filteredLanguages.length} 个语言页成功, 去重后 ${allRepos.length} 个仓库`);

  // Sort by stars today (descending)
  return allRepos.sort((a, b) => b.starsToday - a.starsToday);
}

/**
 * Fetch trending with fallback language enrichment
 * This ensures all repos have language information
 */
export async function fetchTrendingWithEnrichment(options = {}) {
  const { languages = [''] } = options;

  // Fetch trending repos
  let repos = await fetchMultiLanguageTrending(languages);

  // Fill missing languages via GitHub API
  const missingLangCount = repos.filter(r => !r.language).length;
  if (missingLangCount > 0) {
    console.log(`  📝 Enriching ${missingLangCount} repos with missing languages...`);
    repos = await fillMissingLanguages(repos);
  }

  return repos;
}

/**
 * PusherTrending
 * 把榜单数据推送到站点接口
 *
 * 注意: 站点前置是 Cloudflare + 自建 worker 代理, 无论后端成功与否都会返回 HTTP 200,
 * 真实结果在 body 的 {code, data:{success, failed}} 里。原来只看 HTTP 状态,
 * 推送失败会被完全吞掉(日志里还以为成功了), 这里必须校验 body。
 *
 * @param {*} repos
 * @param {*} apis
 * @returns {{ ok: boolean, results: Array }}
 */
export async function pusherTrending(repos, apis = [], options = {}) {
  const { retries = 3, timeout = 20000 } = options;

  if (!Array.isArray(apis) || apis.length === 0) {
    console.warn('  ⚠️ No Pusher APIs configured, skipping push');
    return { ok: false, results: [] };
  }

  if (!Array.isArray(repos) || repos.length === 0) {
    console.warn('  ⚠️ repos 为空, 跳过推送');
    return { ok: false, results: [] };
  }

  const payload = { list: repos, timestamp: Date.now(), source: 'github-trending' };
  const headers = {
    'Content-Type': 'application/json',
    'User-Agent': 'awesome-trending-repos/1.0 (+github-actions)'
  };
  if (process.env.GITHUB_TOKEN) {
    headers['Authorization'] = `token ${process.env.GITHUB_TOKEN}`;
  }

  const results = [];

  for (const api of apis) {
    let lastError = null;

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const res = await axios.post(api, payload, {
          headers,
          timeout,
          validateStatus: () => true
        });

        const body = res.data;
        const failedCount = body?.data?.failed;
        const okStatus = res.status >= 200 && res.status < 300;
        const okBody = body?.code === 200 && !(Number(failedCount) > 0);

        if (okStatus && okBody) {
          console.log(`  🚀 推送成功 [${api}] ${failedCount !== undefined ? `(success: ${body?.data?.success}, failed: ${failedCount})` : ''}`);
          results.push({ api, ok: true, body });
          lastError = null;
          break;
        }

        const detail = typeof body === 'string' ? body.slice(0, 120) : JSON.stringify(body).slice(0, 200);
        lastError = new Error(`HTTP ${res.status} ${detail}`);
      } catch (error) {
        lastError = error;
      }

      if (attempt < retries) {
        const wait = 1000 * attempt;
        console.warn(`  ⚠️ 推送失败(${lastError.message}), ${wait}ms 后第 ${attempt} 次重试: ${api}`);
        await sleep(wait);
      }
    }

    if (lastError) {
      console.error(`  ❌ 推送失败 [${api}]: ${lastError.message}`);
      results.push({ api, ok: false, error: lastError.message });
    }
  }

  return { ok: results.some(r => r.ok), results };
}


/**
 * Re-export TRENDING_LANGUAGES as POPULAR_LANGUAGES for backward compatibility
 */
export { TRENDING_LANGUAGES as POPULAR_LANGUAGES } from '../config.js';

export default {
  fetchGitHubTrending,
  fetchMultiLanguageTrending,
  fetchTrendingWithEnrichment,
  POPULAR_LANGUAGES: TRENDING_LANGUAGES,
  pusherTrending
};
