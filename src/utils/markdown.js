/**
 * Generate Markdown table from trending repositories data
 */

/**
 * Format a number with K/M/B suffixes
 */
export function formatNumber(num) {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + 'M';
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'K';
  }
  return num.toString();
}

/**
 * Create a language badge markdown
 */
export function languageBadge(language) {
  if (!language) return 'Unknown';
  const colors = {
    JavaScript: '#f1e05a',
    TypeScript: '#3178c6',
    Python: '#3572A5',
    Java: '#b07219',
    'C++': '#f34b7d',
    C: '#555555',
    Go: '#00ADD8',
    Rust: '#dea584',
    Ruby: '#701516',
    PHP: '#4F5D95',
    Swift: '#F05138',
    Kotlin: '#A97BFF',
    Dart: '#00B4AB',
    Shell: '#89e051',
    HTML: '#e34c26',
    CSS: '#563d7c',
  };
  const color = colors[language] || '#cccccc';
  return `![](https://img.shields.io/badge/${encodeURIComponent(language)}-${color.slice(1)}?style=flat-square&logo=data:image/svg%2bxml;base64,PHN2ZyB3aWR0aD0iMTYiIGhlaWdodD0iMTYiIHZpZXdCb3g9IjAgMCAxNiAxNiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cGF0aCBkPSJNOCAwQzMuNTggMCAwIDMuNTggMCA4QzAgMTIuNDIgMy41OCAxNiA4IDE2QzEyLjQyIDE2IDE2IDEyLjQyIDE2IDhDMTYgMy41OCAxMi40MiAwIDggMFpNOCAxNEMzLjY4IDE0IDEgMTEuMzIgMSA4QzEgNC42OCAzLjY4IDIgOCAyQzExLjMyIDIgMTQgNC42OCAxNCA4QzE0IDExLjMyIDExLjMyIDE0IDggMTRaIiBmaWxsPSIjZmZmIi8+PC9zdmc+)`;
}

/**
 * Create repository link with owner/name format
 */
export function repoLink(owner, name) {
  return `[${owner}/${name}](https://github.com/${owner}/${name})`;
}

/**
 * Generate the trending table header
 */
export function generateTableHeader() {
  return `| Rank | Repository | Stars | Language | 24h Growth | Description |
|------|------------|-------|----------|------------|-------------|`;
}

/**
 * Generate a single row for the trending table
 */
export function generateTableRow(repo, rank) {
  const { owner, name, stars, language, growth, description } = repo;
  const repoLinkText = repoLink(owner, name);
  const starsFormatted = formatNumber(stars);
  const languageBadgeText = languageBadge(language);
  const growthText = growth > 0 ? `+${formatNumber(growth)} ⭐` : '-';
  const descEscaped = (description || '').replace(/\|/g, '\\|').replace(/\n/g, ' ').slice(0, 60);

  return `| ${rank} | ${repoLinkText} | ${starsFormatted} | ${languageBadgeText} | ${growthText} | ${descEscaped} |`;
}

/**
 * Generate the full trending table
 */
export function generateTrendingTable(repos) {
  const rows = repos.map((repo, index) => generateTableRow(repo, index + 1));
  return `${generateTableHeader()}\n${rows.join('\n')}\n`;
}

/**
 * Generate insights section
 */
export function generateInsightsSection(insights) {
  const { risingStar, topLanguages, newEntrants, totalStars, lastUpdated } = insights;

  return `
### 📊 Insights

* **Rising Star**: [${risingStar.owner}/${risingStar.name}](https://github.com/${risingStar.owner}/${risingStar.name}) with +${formatNumber(risingStar.growth)} stars
* **Top Languages**: ${topLanguages.map((lang, i) => `${i + 1}. ${lang.language} (${lang.count})`).join(', ')}
* **New Entrants Today**: ${newEntrants.length}
* **Total Stars Tracked**: ${formatNumber(totalStars)}
`;
}

/**
 * Generate language breakdown section
 */
export function generateLanguageBreakdown(repos) {
  const langMap = new Map();
  repos.forEach(repo => {
    const lang = repo.language || 'Unknown';
    langMap.set(lang, (langMap.get(lang) || 0) + 1);
  });

  const sorted = Array.from(langMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  const bars = sorted.map(([lang, count]) => {
    const percentage = ((count / repos.length) * 100).toFixed(1);
    const barLength = Math.round(percentage / 2);
    const bar = '█'.repeat(barLength);
    return `${lang.padEnd(15)} ${bar} ${count} (${percentage}%)`;
  }).join('\n');

  const header = `### 🏷️ Language Distribution\n\n`;
  const codeBlock = '```\n';
  const endCodeBlock = '\n```\n';

  return header + codeBlock + bars + endCodeBlock;
}

// ============================================================================
// HISTORICAL COMPARISON MARKDOWN GENERATION
// ============================================================================

/**
 * Generate historical comparison section
 */
export function generateComparisonSection(comparison) {
  let markdown = `
### 🔄 Changes Since Last Update

`;

  // New entrants
  if (comparison.newEntrants.length > 0) {
    markdown += `**🆕 New Entrants (${comparison.totalNew}):**\n\n`;
    comparison.newEntrants.forEach(repo => {
      markdown += `• [${repo.owner}/${repo.name}](https://github.com/${repo.owner}/${repo.name}) - +${formatNumber(repo.growth)} ⭐\n`;
    });
    markdown += '\n';
  }

  // Dropped repos
  if (comparison.dropped.length > 0) {
    markdown += `**📉 Dropped (${comparison.totalDropped}):**\n\n`;
    comparison.dropped.forEach(repo => {
      markdown += `• [${repo.owner}/${repo.name}](https://github.com/${repo.owner}/${repo.name}) (was #${repo.previousRank})\n`;
    });
    markdown += '\n';
  }

  // Rank climbers
  if (comparison.movers.up.length > 0) {
    markdown += `**⏫ Rising ( climbers):**\n\n`;
    comparison.movers.up.forEach(repo => {
      markdown += `• [${repo.owner}/${repo.name}](https://github.com/${repo.owner}/${repo.name}) - #${repo.previousRank} → #${repo.currentRank} (${repo.change} positions)\n`;
    });
    markdown += '\n';
  }

  // Rank fallers
  if (comparison.movers.down.length > 0) {
    markdown += `**⏬ Falling:**\n\n`;
    comparison.movers.down.forEach(repo => {
      markdown += `• [${repo.owner}/${repo.name}](https://github.com/${repo.owner}/${repo.name}) - #${repo.previousRank} → #${repo.currentRank} (${repo.change} positions)\n`;
    });
    markdown += '\n';
  }

  return markdown;
}

/**
 * Generate trend graphs section
 */
export function generateTrendGraphs(analysis, repos) {
  let markdown = `
### 📊 Trend Analysis

`;

  // Star growth leaders
  if (analysis.starGrowthLeaders.length > 0) {
    markdown += `**🔥 Hottest Today (by star growth):**\n\n`;
    const maxGrowth = Math.max(...analysis.starGrowthLeaders.map(r => r.growth));

    analysis.starGrowthLeaders.forEach(repo => {
      const barLength = maxGrowth > 0 ? Math.round((repo.growth / maxGrowth) * 20) : 0;
      const bar = '🔥'.repeat(Math.min(barLength, 10)) + '▪'.repeat(Math.max(10 - barLength, 0));
      markdown += `${bar} [+${formatNumber(repo.growth)}] [${repo.owner}/${repo.name}](https://github.com/${repo.owner}/${repo.name})\n`;
    });
    markdown += '\n';
  }

  // Language trends
  if (analysis.languageTrends.length > 0) {
    markdown += `**📈 Language Trend Changes:**\n\n`;

    analysis.languageTrends.forEach(lang => {
      const change = lang.change;
      const indicator = change > 0 ? '📈' : change < 0 ? '📉' : '➡️';
      const changeText = change > 0 ? `+${change}` : change.toString();
      markdown += `${indicator} **${lang.language}**: ${lang.current} repos (${changeText}, ${lang.percentage}%)\n`;
    });
    markdown += '\n';
  }

  // Consistent performers
  if (analysis.consistencyLeaders.length > 0) {
    markdown += `**🏆 Consistent Performers** (appearing in multiple recent updates):\n\n`;

    analysis.consistencyLeaders.forEach(repo => {
      const consistencyPercent = ((repo.appearances / repo.totalSnapshots) * 100).toFixed(0);
      const stars = '⭐'.repeat(Math.ceil(repo.appearances / 2));
      markdown += `${stars} [${repo.owner}/${repo.name}](https://github.com/${repo.owner}/${repo.name}) - ${repo.appearances}/${repo.totalSnapshots} updates (${consistencyPercent}%)\n`;
    });
    markdown += '\n';
  }

  return markdown;
}

/**
 * Generate ASCII bar chart for language trends
 */
export function generateBarChart(data, width = 30) {
  const maxValue = Math.max(...data.map(d => d.value));

  return data.map(item => {
    const barLength = Math.round((item.value / maxValue) * width);
    const bar = '█'.repeat(barLength);
    const label = item.label.padEnd(15);
    const value = item.value.toString().padStart(5);
    return `${label} ${bar} ${value}`;
  }).join('\n');
}

/**
 * Generate sparkline-style trend graph
 */
export function generateSparkline(values, width = 20) {
  if (values.length === 0) return '▁▁▁▁▁';

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const sparkChars = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];
  const normalized = values.map(v => Math.round(((v - min) / range) * (sparkChars.length - 1)));

  return normalized.map(n => sparkChars[Math.min(n, sparkChars.length - 1)]).join('');
}
