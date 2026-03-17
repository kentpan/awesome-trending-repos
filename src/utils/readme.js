import { promises as fs } from 'fs';
import { resolve } from 'path';

const START_MARKER = '<!-- START_TRENDING -->';
const END_MARKER = '<!-- END_TRENDING -->';

/**
 * Read the README file
 */
export async function readReadme(readmePath = 'README.md') {
  try {
    const content = await fs.readFile(resolve(readmePath), 'utf-8');
    return content;
  } catch (error) {
    if (error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

/**
 * Extract the content between trending markers
 */
export function extractTrendingSection(readmeContent) {
  const startIndex = readmeContent.indexOf(START_MARKER);
  const endIndex = readmeContent.indexOf(END_MARKER);

  if (startIndex === -1 || endIndex === -1) {
    return null;
  }

  return readmeContent.slice(startIndex, endIndex + END_MARKER.length);
}

/**
 * Replace the trending section with new content
 */
export function replaceTrendingSection(readmeContent, newContent) {
  const startIndex = readmeContent.indexOf(START_MARKER);
  const endIndex = readmeContent.indexOf(END_MARKER);

  if (startIndex === -1 || endIndex === -1) {
    // Markers not found, append to end
    return readmeContent + '\n' + START_MARKER + '\n' + newContent + '\n' + END_MARKER;
  }

  const before = readmeContent.slice(0, startIndex);
  const after = readmeContent.slice(endIndex + END_MARKER.length);

  return before + START_MARKER + '\n' + newContent + '\n' + END_MARKER + after;
}

/**
 * Update README with new trending content
 */
export async function updateReadme(trendingContent, readmePath = 'README.md') {
  const existingContent = await readReadme(readmePath);

  if (!existingContent) {
    // Create new README
    const newContent = generateBaseReadme() + '\n' + START_MARKER + '\n' + trendingContent + '\n' + END_MARKER;
    await fs.writeFile(resolve(readmePath), newContent, 'utf-8');
    return { created: true, modified: false };
  }

  const newContent = replaceTrendingSection(existingContent, trendingContent);

  // Check if content actually changed
  if (newContent === existingContent) {
    return { created: false, modified: false };
  }

  await fs.writeFile(resolve(readmePath), newContent, 'utf-8');
  return { created: false, modified: true };
}

/**
 * Generate base README structure (used when file doesn't exist)
 */
function generateBaseReadme() {
  return `# Awesome Trending Repos

🚀 A daily-updated, auto-curated list of the most awesome trending open-source repositories. Enriched with deep insights and historical data, powered by GitHub Actions.

## Features

- 📊 **Daily Updates**: Automatically updated every day at midnight UTC
- 🏷️ **Language Insights**: Trending repos grouped by programming language
- ⭐ **Growth Tracking**: Track 24-hour star growth for each repository
- 🆕 **New Entrants**: Discover new projects entering the trending list
- 📈 **Rising Stars**: Highlight the fastest growing repositories

## How It Works

1. **Data Collection**: Fetches trending repositories from GitHub's trending page
2. **Enrichment**: Adds insights using GitHub's Search API for growth metrics
3. **Analysis**: Groups by language, calculates growth rates, identifies patterns
4. **Auto-Update**: GitHub Actions runs daily to update this README

`;
}

/**
 * Check if README has trending markers
 */
export function hasTrendingMarkers(readmeContent) {
  return readmeContent.includes(START_MARKER) && readmeContent.includes(END_MARKER);
}
