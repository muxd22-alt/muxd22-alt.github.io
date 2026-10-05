# muxd22-alt.github.io

**MUXD Content Dashboard** — a unified view of the *content* itself (files,
folders, READMEs) across all repos, not of the monorepo metadata.

Indexed repos:

- monorepos: `quant-econ`, `news-dashboards`, `agent-tools`, `mobile-android`, `geo-unity`
- pinned standalones: `UHI_SAUDI`, `1ooo`, `future_proofing`, `SectorShift`

## What you get

- **Search across everything** — one box finds members, folders and files in any repo
- **Unified sidebar tree** — every repo → every member → every folder, lazy-loaded
- **Member pages** — the member's README rendered in full + its complete file list
- **File viewer** — any file streamed live from `raw.githubusercontent.com`,
  Markdown rendered, images shown, code in a monospace preview
- Home cards for all 44+ members with README excerpt, size and language chips

## How it works

`.github/workflows/refresh.yml` runs twice daily (06:15 / 18:15 UTC) and on
demand. It collects, for every repo:

- the complete recursive git tree (`path` + `size` for every blob)
- the README of the repo and of every `repos/<member>/` folder

into `data.json`. The page itself is static HTML/CSS/JS — file bodies are
fetched from GitHub raw on click, so the dashboard never stores copies.

Served by GitHub Pages at https://muxd22-alt.github.io
