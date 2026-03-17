<div align="center">

# 🚀 Awesome Trending Repos

**A daily-updated, auto-curated list of the most awesome trending open-source repositories.**

[![Awesome](https://img.shields.io/badge/awesome-list-brightgreen?style=for-the-badge)](https://github.com/sindresorhus/awesome)
[![License](https://img.shields.io/badge/license-MIT-blue?style=for-the-badge)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green?style=for-the-badge&logo=node.js)](https://nodejs.org/)

> Enriched with deep insights and historical data, powered by GitHub Actions.

</div>

---

## 📑 Table of Contents

- [✨ Features](#-features)
- [📈 Today's Trending Repositories](#-todays-trending-repositories)
- [🗂️ Project Structure](#-project-structure)
- [📜 License](#-license)

---

## ✨ Features

- **🔄 Daily Updates** — Automatically refreshed every day at midnight UTC.
- **📊 Historical Comparison** — Shows changes since the last update, including new entrants and rank changes.
- **📈 Visual Graphs** — ASCII bar charts and trend visualizations.
- **🏷️ Language Insights** — Groups trending repos by programming language.
- **⭐ Growth Tracking** — Shows 24-hour star growth for each repository.
- **🏆 Rising Stars** — Highlights the fastest-growing repositories.
- **💾 Data Persistence** — Stores 7 days of historical snapshots.

---

<!-- START_TRENDING -->
<!-- END_TRENDING -->

-----

## 🗂️ Project Structure

```text
awesome-trending-repos/
├── .github/workflows/
│   └── update-trends.yml      # Daily cron automation
├── .data/
│   ├── history.json           # Historical summary
│   └── snapshots/             # Daily snapshots (7 days)
├── src/
│   ├── data-sources/
│   │   ├── github-trending.js # GitHub scraper
│   │   ├── github-search.js   # Search API fallback
│   │   └── github-enrich.js   # Repository enrichment
│   ├── utils.js               # Essential utilities
│   ├── config.js              # Configuration
│   └── update.js              # Main entry point
├── package.json
└── README.md
```

-----

<div align="center">

## 📜 License

Released under the [MIT License](LICENSE) © Furkan Köykıran

**Built with ❤️ using Node.js and GitHub Actions**

[⭐ Star](https://github.com/furkankoykiran/awesome-trending-repos) · [🐛 Issues](https://github.com/furkankoykiran/awesome-trending-repos/issues) · [🔔 Watch](https://github.com/furkankoykiran/awesome-trending-repos/subscription)

</div>
