/**
 * Calculate insights from trending repositories data
 */

/**
 * Group repositories by language
 */
export function groupByLanguage(repos) {
  const groups = new Map();

  repos.forEach(repo => {
    const lang = repo.language || 'Unknown';
    if (!groups.has(lang)) {
      groups.set(lang, []);
    }
    groups.get(lang).push(repo);
  });

  return groups;
}

/**
 * Get top languages by repository count
 */
export function getTopLanguages(repos, limit = 5) {
  const langCounts = new Map();

  repos.forEach(repo => {
    const lang = repo.language || 'Unknown';
    langCounts.set(lang, (langCounts.get(lang) || 0) + 1);
  });

  return Array.from(langCounts.entries())
    .map(([language, count]) => ({ language, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

/**
 * Find the rising star (repo with highest growth)
 */
export function findRisingStar(repos) {
  if (repos.length === 0) {
    return { owner: 'N/A', name: 'N/A', growth: 0 };
  }

  const rising = repos.reduce((max, repo) => {
    return (repo.growth || 0) > (max.growth || 0) ? repo : max;
  }, repos[0]);

  return {
    owner: rising.owner,
    name: rising.name,
    growth: rising.growth || 0
  };
}

/**
 * Filter popular programming languages
 */
export function filterPopularLanguages(repos) {
  const popularLanguages = new Set([
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
    'CSS'
  ]);

  return repos.filter(repo => {
    const lang = repo.language;
    return !lang || popularLanguages.has(lang);
  });
}

/**
 * Calculate growth metrics
 */
export function calculateGrowthMetrics(repos, previousRepos = []) {
  const previousMap = new Map();

  previousRepos.forEach(repo => {
    const key = `${repo.owner}/${repo.name}`;
    previousMap.set(key, repo.stars);
  });

  return repos.map(repo => {
    const key = `${repo.owner}/${repo.name}`;
    const previousStars = previousMap.get(key) || 0;
    const growth = repo.stars - previousStars;

    return {
      ...repo,
      growth,
      isNew: !previousMap.has(key)
    };
  });
}

/**
 * Find new entrants (repos not in previous data)
 */
export function findNewEntrants(repos, previousRepos = []) {
  const previousKeys = new Set(
    previousRepos.map(repo => `${repo.owner}/${repo.name}`)
  );

  return repos.filter(repo => {
    const key = `${repo.owner}/${repo.name}`;
    return !previousKeys.has(key);
  });
}

/**
 * Calculate total stars across all repos
 */
export function calculateTotalStars(repos) {
  return repos.reduce((sum, repo) => sum + (repo.stars || 0), 0);
}

/**
 * Generate comprehensive insights
 */
export function generateInsights(repos, previousRepos = []) {
  const reposWithGrowth = calculateGrowthMetrics(repos, previousRepos);
  const newEntrants = findNewEntrants(reposWithGrowth, previousRepos);

  return {
    risingStar: findRisingStar(reposWithGrowth),
    topLanguages: getTopLanguages(repos),
    newEntrants,
    totalStars: calculateTotalStars(repos),
    reposWithGrowth,
    languageGroups: groupByLanguage(repos),
    newEntrantsCount: newEntrants.length
  };
}

/**
 * Sort repos by growth rate
 */
export function sortByGrowth(repos) {
  return [...repos].sort((a, b) => (b.growth || 0) - (a.growth || 0));
}

/**
 * Limit repos to top N
 */
export function limitToTop(repos, limit) {
  return repos.slice(0, limit);
}

// ============================================================================
// HISTORICAL COMPARISON FUNCTIONS
// ============================================================================

/**
 * Compare current repos with previous repos
 */
export function generateHistoricalComparison(currentRepos, previousRepos) {
  const currentKeys = new Set(currentRepos.map(r => `${r.owner}/${r.name}`));
  const previousKeys = new Set(previousRepos.map(r => `${r.owner}/${r.name}`));

  // Create lookup maps
  const currentMap = new Map();
  currentRepos.forEach((repo, index) => {
    currentMap.set(`${repo.owner}/${repo.name}`, { ...repo, currentRank: index + 1 });
  });

  const previousMap = new Map();
  previousRepos.forEach((repo, index) => {
    previousMap.set(`${repo.owner}/${repo.name}`, { ...repo, previousRank: index + 1 });
  });

  // Find new entrants
  const newEntrants = currentRepos.filter(repo => {
    const key = `${repo.owner}/${repo.name}`;
    return !previousKeys.has(key);
  }).map(repo => ({
    ...repo,
    growth: repo.starsToday || repo.growth || 0
  })).sort((a, b) => b.growth - a.growth).slice(0, 5);

  // Find dropped repos
  const dropped = previousRepos.filter(repo => {
    const key = `${repo.owner}/${repo.name}`;
    return !currentKeys.has(key);
  }).map(repo => ({
    ...repo,
    previousRank: previousRepos.indexOf(repo) + 1
  })).slice(0, 5);

  // Find movers (repos that changed rank)
  const movers = { up: [], down: [] };

  for (const [key, currentData] of currentMap) {
    const previousData = previousMap.get(key);
    if (previousData) {
      const rankChange = previousData.previousRank - currentData.currentRank;
      if (rankChange > 0) {
        movers.up.push({
          owner: currentData.owner,
          name: currentData.name,
          currentRank: currentData.currentRank,
          previousRank: previousData.previousRank,
          change: rankChange,
          growth: currentData.starsToday || currentData.growth || 0
        });
      } else if (rankChange < 0) {
        movers.down.push({
          owner: currentData.owner,
          name: currentData.name,
          currentRank: currentData.currentRank,
          previousRank: previousData.previousRank,
          change: Math.abs(rankChange),
          growth: currentData.starsToday || currentData.growth || 0
        });
      }
    }
  }

  // Sort movers by change magnitude
  movers.up.sort((a, b) => b.change - a.change);
  movers.down.sort((a, b) => b.change - a.change);

  // Limit results
  movers.up = movers.up.slice(0, 5);
  movers.down = movers.down.slice(0, 5);

  return {
    newEntrants,
    dropped,
    movers,
    totalNew: newEntrants.length,
    totalDropped: dropped.length
  };
}

/**
 * Generate trend analysis from historical snapshots
 */
export function generateTrendAnalysis(currentRepos, previousRepos, historicalSnapshots = []) {
  const analysis = {
    starGrowthLeaders: [],
    languageTrends: [],
    consistencyLeaders: [],
    periodAnalysis: []
  };

  // Star growth leaders (repos with highest daily growth)
  analysis.starGrowthLeaders = [...currentRepos]
    .map(repo => ({
      owner: repo.owner,
      name: repo.name,
      language: repo.language,
      growth: repo.starsToday || repo.growth || 0
    }))
    .sort((a, b) => b.growth - a.growth)
    .slice(0, 5);

  // Language trends (compare language distribution)
  const currentLangs = getLanguageDistribution(currentRepos);
  const previousLangs = previousRepos.length > 0 ? getLanguageDistribution(previousRepos) : {};

  analysis.languageTrends = Object.entries(currentLangs).map(([lang, count]) => ({
    language: lang,
    current: count,
    previous: previousLangs[lang] || 0,
    change: count - (previousLangs[lang] || 0),
    percentage: ((count / currentRepos.length) * 100).toFixed(1)
  })).sort((a, b) => b.change - a.change).slice(0, 5);

  // Find consistent performers (repos appearing in multiple snapshots)
  const repoAppearanceCount = new Map();
  const allSnapshots = [previousRepos, ...historicalSnapshots.slice(0, 3).map(s => s.repos || [])].filter(r => r.length > 0);

  for (const snapshot of allSnapshots) {
    for (const repo of snapshot) {
      const key = `${repo.owner}/${repo.name}`;
      repoAppearanceCount.set(key, (repoAppearanceCount.get(key) || 0) + 1);
    }
  }

  analysis.consistencyLeaders = Array.from(repoAppearanceCount.entries())
    .filter(([key]) => {
      const [owner, name] = key.split('/');
      return currentRepos.some(r => r.owner === owner && r.name === name);
    })
    .map(([key, count]) => {
      const [owner, name] = key.split('/');
      const current = currentRepos.find(r => r.owner === owner && r.name === name);
      return {
        owner,
        name,
        appearances: count,
        totalSnapshots: allSnapshots.length,
    language: current?.language || 'Unknown'
      };
    })
    .sort((a, b) => b.appearances - a.appearances)
    .slice(0, 5);

  return analysis;
}

/**
 * Get language distribution from repos
 */
function getLanguageDistribution(repos) {
  const dist = {};
  repos.forEach(repo => {
    const lang = repo.language || 'Unknown';
    dist[lang] = (dist[lang] || 0) + 1;
  });
  return dist;
}

/**
 * Get language trends over time from snapshots
 */
export function getLanguageTrendsOverTime(snapshots) {
  const trends = new Map();

  snapshots.forEach((snapshot, index) => {
    const repos = snapshot.repos || [];
    const date = new Date(snapshot.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

    repos.forEach(repo => {
      const lang = repo.language || 'Unknown';
      if (!trends.has(lang)) {
        trends.set(lang, {});
      }
      trends.get(lang)[date] = (trends.get(lang)[date] || 0) + 1;
    });
  });

  return Object.fromEntries(trends);
}
