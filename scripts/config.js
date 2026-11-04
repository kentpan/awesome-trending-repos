/**
 * Configuration for Awesome Trending Repos
 * Centralized settings for data fetching, processing, and display
 */

/**
 * Popular programming languages to filter by
 */
export const POPULAR_LANGUAGES = new Set([
  'JavaScript',
  'TypeScript',
  'Python',
  'Go',
  'Rust',
  'Java',
  'C++',
  'Ruby',
  'PHP',
  'Swift',
  'Kotlin',
  'Dart',
  'Shell',
  'HTML',
  'CSS',
  'C',
  'C#',
  'Scala',
  'Elixir',
  'Haskell'
]);

/**
 * GitHub language badge colors (hex format without #)
 */
export const LANGUAGE_COLORS = {
  JavaScript: 'f1e05a',
  TypeScript: '3178c6',
  Python: '3572A5',
  Java: 'b07219',
  'C++': 'f34b7d',
  C: '555555',
  Go: '00ADD8',
  Rust: 'dea584',
  Ruby: '701516',
  PHP: '4F5D95',
  Swift: 'F05138',
  Kotlin: 'A97BFF',
  Dart: '00B4AB',
  Shell: '89e051',
  HTML: 'e34c26',
  CSS: '563d7c',
  'C#': '239120',
  Scala: 'c22d40',
  Elixir: '6e4a7e',
  Haskell: '5e5086'
};

/**
 * Main configuration object
 */
export const CONFIG = {
  // Data collection settings
  maxRepos: 25,  // Top 25 repos is enough - cleaner and faster
  historyDays: 7,
  // 快照文件保留天数(按文件名日期计算, 不按 mtime)。
  // 0 = 永久保留。站点会按日期回读 .data/snapshots/YYYY-MM-DD.json,
  // 删掉就等于丢掉历史榜单, 单文件才 13KB, 没必要清。
  snapshotRetentionDays: 0,
  fallbackToSearch: true,
  filterLanguages: true,

  // Display settings
  includeInsights: true,
  includeLanguageBreakdown: true,
  includeHistoricalComparison: true,
  includeTrendGraphs: true,
  includeHealthMetrics: true,
  includeTopics: true,

  // GitHub API settings
  apiBatchSize: 10,
  apiDelayMs: 1000,
  apiMaxRetries: 3,

  // Enrichment settings - simplified for speed
  enrichRepos: false,  // DISABLED - causes rate limits and slowdown
  enrichTopics: false,
  enrichLicense: false,
  enrichStats: false,

  // Badge settings
  badgeStyle: 'flat-square',

  // Data quality thresholds
  minDescriptionLength: 10,
  maxDescriptionLength: 100,
  minStarsForTrending: 100,

  // Health metrics
  staleThresholdDays: 30,
  activeThresholdDays: 7,

  // Display limits
  topReposForHealth: 15,
  topTopicsToShow: 15,
  maxConsistentPerformers: 5,
  maxMoversToShow: 5
};

/**
 * Languages to fetch trending for
 * Note: Empty string (all languages) seems to have issues with GitHub's current structure
 */
export const TRENDING_LANGUAGES = [
  'javascript',
  'typescript',
  'python',
  'go',
  'rust',
  'java',
  'c++',
  'ruby',
  'php',
  'swift',
  'kotlin',
  'dart',
  'shell',
  'html',
  'css'
];

export const PUSHER_APIS = [
  'https://github.xubaoge.com/api/trending/pusherCallback',
];

/**
 * 站点地址, 用于更新后做一次"数据是否真的落地"的验证
 * 注意: 必须用 www 域名 —— 裸域 xubaoge.com 前置了 Cloudflare 人机校验,
 * 非浏览器客户端(含 GitHub Actions)会被 403 "Just a moment..." 拦截
 */
export const SITE_BASE_URL = process.env.SITE_BASE_URL || 'https://www.xubaoge.com';

export default CONFIG;
