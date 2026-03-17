import { Octokit } from 'octokit';

/**
 * GitHub Search API Adapter
 * Used as fallback for fetching trending repositories via search queries
 */

/**
 * Initialize Octokit instance
 */
function getOctokit() {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    console.warn('GITHUB_TOKEN not set. Using unauthenticated requests (limited rate).');
  }

  return new Octokit({
    auth: token || undefined,
    userAgent: 'AwesomeTrendingRepos/1.0'
  });
}

/**
 * Calculate date string for search queries (N days ago)
 */
function getDateSuffix(daysAgo = 1) {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return date.toISOString().split('T')[0];
}

/**
 * Fetch repositories created or updated recently
 *
 * @param {Object} options - Search options
 * @param {string} options.language - Filter by programming language
 * @param {string} options.sort - Sort by: 'stars', 'forks', 'help-wanted-issues'
 * @param {number} options.perPage - Results per page (max 100)
 * @returns {Promise<Array>} Array of repositories
 */
export async function searchGitHubRepos(options = {}) {
  const {
    language = '',
    sort = 'stars',
    order = 'desc',
    perPage = 50
  } = options;

  const octokit = getOctokit();

  // Build search query for repositories created in the last 7 days
  const date = getDateSuffix(7);
  let query = `created:>${date}`;

  if (language) {
    query += `+language:${language}`;
  }

  try {
    const response = await octokit.rest.search.repos({
      q: query,
      sort,
      order,
      per_page: perPage
    });

    return response.data.items.map(normalizeGitHubRepo);
  } catch (error) {
    if (error.status === 403) {
      throw new Error('GitHub rate limit exceeded. Please provide GITHUB_TOKEN for higher limits.');
    }
    throw new Error(`GitHub Search API error: ${error.message}`);
  }
}

/**
 * Normalize GitHub API response to match our data structure
 */
function normalizeGitHubRepo(item) {
  return {
    owner: item.owner.login,
    name: item.name,
    description: item.description || '',
    language: item.language || 'Unknown',
    stars: item.stargazers_count,
    forks: item.forks_count,
    growth: 0, // Not available from search API
    starsToday: 0,
    rank: 0,
    url: item.html_url,
    createdAt: item.created_at,
    updatedAt: item.updated_at,
    fetchedAt: new Date().toISOString(),
    source: 'github-search'
  };
}

/**
 * Fetch repository details including star history
 *
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @returns {Promise<Object>} Repository details with star count
 */
export async function fetchRepoDetails(owner, repo) {
  const octokit = getOctokit();

  try {
    const response = await octokit.rest.repos.get({
      owner,
      repo
    });

    return {
      owner: response.data.owner.login,
      name: response.data.name,
      description: response.data.description || '',
      language: response.data.language || 'Unknown',
      stars: response.data.stargazers_count,
      forks: response.data.forks_count,
      url: response.data.html_url,
      createdAt: response.data.created_at,
      updatedAt: response.data.updated_at,
      fetchedAt: new Date().toISOString()
    };
  } catch (error) {
    throw new Error(`Failed to fetch repo details for ${owner}/${repo}: ${error.message}`);
  }
}

/**
 * Batch fetch details for multiple repositories
 *
 * @param {Array} repos - Array of {owner, name} objects
 * @returns {Promise<Array>} Array of repository details
 */
export async function batchFetchRepoDetails(repos) {
  const results = [];

  // Process in batches to respect rate limits
  const batchSize = 10;
  for (let i = 0; i < repos.length; i += batchSize) {
    const batch = repos.slice(i, i + batchSize);
    const details = await Promise.allSettled(
      batch.map(repo => fetchRepoDetails(repo.owner, repo.name))
    );

    for (const result of details) {
      if (result.status === 'fulfilled') {
        results.push(result.value);
      }
    }

    // Add delay between batches to respect rate limits
    if (i + batchSize < repos.length) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  return results;
}

/**
 * Search for trending repositories using multiple queries
 */
export async function searchTrendingRepos(options = {}) {
  const {
    languages = ['javascript', 'python', 'typescript', 'go', 'rust', 'java'],
    resultsPerLanguage = 10
  } = options;

  const results = await Promise.allSettled(
    languages.map(lang =>
      searchGitHubRepos({ language: lang, perPage: resultsPerLanguage })
    )
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

  return allRepos.sort((a, b) => b.stars - a.stars);
}

export default {
  searchGitHubRepos,
  fetchRepoDetails,
  batchFetchRepoDetails,
  searchTrendingRepos
};
