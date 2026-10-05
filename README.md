# muxd22-alt.github.io

**MUXD Content Dashboard** — one site, **five real dashboards** (one per
monorepo), each built from the actual data files inside that monorepo's
members, plus a full content explorer.

Indexed repos:

- monorepos: `quant-econ`, `news-dashboards`, `agent-tools`, `mobile-android`, `geo-unity`
- pinned standalones: `UHI_SAUDI`, `1ooo`, `future_proofing`, `SectorShift`

## The five dashboards

| Tab | Board | Real data it renders |
|---|---|---|
| **Quant Econ** | Quant & Econ Desk | TASI/QQQ/Oil OHLC snapshot + AI sentiment (`TASI/docs/data.json`), TASI model top-ranked stocks from `quant_model_results.csv`, China go/no-go call + readiness + budget burn + routes + decision history (`China/data/summary.json`), macro news radar with per-category counts (`future_proofing/data/news.json`), labour-vs-AI narrative lanes (`post_labour_tracker`), China pipeline news by feed |
| **News Intel** | News Intelligence | Live global headlines + source mix (`global-news-dashboard/news-data.json`), Iran desk stories by region & bias + conflict timeline + war metrics (`iran-news-dashboard`), PAI master digest + scout gaps (`PAI`), AI stock movers + sector trend (`ai_research_dashboard/stocks.json`) |
| **Agent Lab** | Agent Lab | Newsjack eval scoreboards — pipeline stages, lanes, queue priority / profile match / story size per run (`newsjack/eval/.../summary.json`), BLS occupations — fastest-growing + top-paying + categories (`jobs/occupations.csv`), CoreML/ANE ms + joules per decision (`laya-coreml/benchmarks/results/ane-energy-summary.json`), OpenViking architecture & roadmap docs |
| **Mobile & Embedded** | Mobile & Embedded | termux_reader feed health table with error states, bc250/SMU findings & testing results (checklist pass/fail parsed), TallDuoLauncher merge summary + architecture, termux roadmap, codebase composition from the file tree |
| **Geo & Unity** | Geo & Unity Studio | 3D asset catalog with sizes (`.glb` models from the tree), CityBuilder Unity packages, cesium-unity third-party licenses, 1ooo Laya ML model spec, per-project matrix |

Every KPI tile, bar and table is derived from file contents collected by the
refresh workflow — not from monorepo metadata.

## Also included

- **Explorer tab** (`#/`) — unified sidebar tree of every repo/member/folder,
  member pages with README + full file list, and a live file viewer streamed
  from `raw.githubusercontent.com`
- **Search across everything** — one box finds members, folders and files

## How it works

`.github/workflows/refresh.yml` runs twice daily (06:15 / 18:15 UTC) and on
demand. For every repo it collects the complete recursive git tree plus every
README, then auto-discovers **knowledge files** with tiered patterns:

- **Tier A** - feeds/data: `rss.xml`, `data.json`, `news*.json`, `gaps*.json`,
  `scout*.json`, `timeline*.json`, `summary*.json`, ...
- **Tier B** - knowledge docs: `*ROADMAP*`, `*ARCHITECTURE*`, `*FINDINGS*`,
  `*SUMMARY*`, `*RESULTS*` `.md`
- **Tier C** - tables: `*.csv`, `*.geojson`
- **Extras** - curated dashboard inputs the patterns can't match
  (`stocks.json`, `war-metrics.json`, `ane-energy-summary.json`,
  `laya-reference.json`, Unity `manifest.json`, `ThirdParty.json`)

Caps: max 250 KB/file, 4/member, 24/repo, 6 MB total. The page is static
HTML/CSS/JS (no build step, no chart library — bars/tables are plain DOM);
file bodies for the viewer are fetched from GitHub raw on click.

Served by GitHub Pages at https://muxd22-alt.github.io
