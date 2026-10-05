# muxd22-alt.github.io

Shared **MUXD Knowledge Dashboard** — one combined view over the consolidated
monorepos (excluding `mobile-android`, which is apps, not dashboards):

- [quant-econ](https://github.com/muxd22-alt/quant-econ)
- [news-dashboards](https://github.com/muxd22-alt/news-dashboards)
- [agent-tools](https://github.com/muxd22-alt/agent-tools)
- [geo-unity](https://github.com/muxd22-alt/geo-unity)

## What it shows

- cards per monorepo: members, files, size, stars, languages, last push, CI badge
- recent commits across all monorepos in one table
- latest workflow runs (the shared CI / daily-digest actions)
- full index of every `repos/<member>/` folder with file counts

## How it works

`.github/workflows/refresh.yml` runs twice daily (06:15 / 18:15 UTC) and on
demand: it aggregates repo metadata, git trees, commits and workflow runs from
the four monorepos into `data.json`, commits it back, and GitHub Pages serves
`index.html` + `data.json` at https://muxd22-alt.github.io

No build step, no dependencies — static HTML/CSS/JS only.
