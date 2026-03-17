import axios from 'axios';
import * as cheerio from 'cheerio';

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
export async function fetchGitHubTrending(options = {}) {
  const {
    language = '',
    since = 'daily',
    spokenLanguage = ''
  } = options;

  // Build URL for GitHub trending page
  const url = new URL('https://github.com/trending');
  if (language) {
    url.pathname = `/${language}`;
  }

  const params = new URLSearchParams();
  if (since) {
    params.append('since', since);
  }
  if (spokenLanguage) {
    params.append('spoken_language_code', spokenLanguage);
  }

  if (params.toString()) {
    url.search = params.toString();
  }

  try {
    const response = await axios.get(url.toString(), {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; AwesomeTrendingRepos/1.0)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      timeout: 10000
    });

    return parseTrendingPage(response.data);
  } catch (error) {
    if (error.response) {
      throw new Error(`GitHub returned ${error.response.status}: ${error.response.statusText}`);
    }
    if (error.code === 'ECONNABORTED') {
      throw new Error('Request timeout - GitHub might be rate limiting or slow');
    }
    throw new Error(`Failed to fetch trending: ${error.message}`);
  }
}

/**
 * Parse HTML from GitHub trending page
 */
function parseTrendingPage(html) {
  const $ = cheerio.load(html);
  const repos = [];

  $('article.Box-row').each((index, element) => {
    const $el = $(element);

    // Extract owner and name from the repository link
    const repoLink = $el.find('h2 a').attr('href') || '';
    const [, owner, name] = repoLink.match(/^\/([^/]+)\/([^/]+)/) || [];

    // Extract description
    const description = $el.find('p').first().text().trim();

    // Extract programming language
    const language = $el.find('[itemprop="programmingLanguage"]').first().text().trim();

    // Extract star count and stars today
    const starsText = $el.find('a[href*="/stargazers"]').first().text().trim();
    const starsTodayText = $el.find('span.d-inline-block.float-sm-right').text().trim();

    const stars = parseStars(starsText);
    const starsToday = parseStarsToday(starsTodayText);

    // Extract fork count
    const forksText = $el.find('a[href*="/forks"]').first().text().trim();
    const forks = parseStars(forksText);

    // Extract current period rank (from position in list)
    const rank = index + 1;

    if (owner && name) {
      repos.push({
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
        fetchedAt: new Date().toISOString()
      });
    }
  });

  return repos;
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
 * Fetch trending for multiple languages
 */
export async function fetchMultiLanguageTrending(languages = ['']) {
  const results = await Promise.allSettled(
    languages.map(lang => fetchGitHubTrending({ language: lang, since: 'daily' }))
  );

  const allRepos = [];
  const seen = new Set();

  for (const result of results) {
    if (result.status === 'fulfilled') {
      for (const repo of result.value) {
        const key = `${repo.owner}/${repo.name}`;
        if (!seen.has(key)) {
          seen.add(key);
          allRepos.push(repo);
        }
      }
    }
  }

  // Sort by stars today (descending)
  return allRepos.sort((a, b) => b.starsToday - a.starsToday);
}

/**
 * Popular languages to fetch trending for
 */
export const POPULAR_LANGUAGES = [
  '',          // All languages
  'javascript',
  'typescript',
  'python',
  'go',
  'rust',
  'java'
];
