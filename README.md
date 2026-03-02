<div align="center">

<img src="assets/icon.png" alt="Orbit" width="128" />

# Orbit

**Development Intelligence Dashboard for GitHub Copilot**

A desktop analytics tool that surfaces GitHub Copilot usage patterns from local VS Code log files.

[![Electron](https://img.shields.io/badge/Electron-33-47848F?logo=electron&logoColor=white)](https://www.electronjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-lightgrey)]()

---

*Read-only. Local-first. No telemetry.*

</div>

<br />

Orbit parses Copilot Chat session logs stored in VS Code's `workspaceStorage` directories (both Stable and Insiders editions) and presents the data through a set of focused analytics pages. It never modifies or uploads your data.

## Features

<table>
  <tr>
    <td><strong>Dashboard</strong></td>
    <td>KPI summary, daily activity chart, top workspaces, hourly heatmap</td>
  </tr>
  <tr>
    <td><strong>Patterns</strong></td>
    <td>7x24 heatmap, hourly work-type distribution, work-type breakdown</td>
  </tr>
  <tr>
    <td><strong>Production</strong></td>
    <td>AI vs user code comparison, daily timeline, language and workspace breakdown</td>
  </tr>
  <tr>
    <td><strong>Consumption</strong></td>
    <td>Cost trends (daily/weekly/monthly), model usage table, cumulative tracking</td>
  </tr>
  <tr>
    <td><strong>Burndown</strong></td>
    <td>Monthly budget tracking with burndown chart and daily consumption bars</td>
  </tr>
  <tr>
    <td><strong>Timeline</strong></td>
    <td>Swim-lane Gantt view of concurrent sessions with day/week/month modes</td>
  </tr>
  <tr>
    <td><strong>Journey</strong></td>
    <td>Per-workspace chronological story: work types, tech stack, model adoption</td>
  </tr>
  <tr>
    <td><strong>Sessions</strong></td>
    <td>Paginated session list with message thread detail view</td>
  </tr>
  <tr>
    <td><strong>Recommendations</strong></td>
    <td>12 local rule-based behavior checks with radar chart</td>
  </tr>
  <tr>
    <td><strong>Agentic Insights</strong></td>
    <td>Optional AI-powered analysis via the Copilot SDK (requires GitHub auth)</td>
  </tr>
</table>

## Tech Stack

<div align="center">

| | Technology | Role |
|---|---|---|
| **Runtime** | Electron | Context isolation, preload scripts |
| **Language** | Vanilla TypeScript | No UI framework |
| **Charts** | Chart.js | All visualizations |
| **Bundler** | esbuild | Target ES2022 |
| **Packager** | electron-builder | Cross-platform distribution |

</div>

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) v18+
- npm (ships with Node.js)

### Install

```bash
git clone <repo-url>
cd orbit
npm install
```

### Develop

```bash
npm run dev
```

Runs esbuild then launches Electron with the `--dev` flag.

### Build

```bash
npm run build    # production build only
npm start        # build and launch
```

### Package

```bash
npm run preflight            # verify assets and config
npm run icons                # generate icon sets from assets/icon.svg
npm run dist                 # package for current platform
```

Platform-specific builds:

```bash
npm run dist:mac             # macOS (dmg + zip)
npm run dist:win             # Windows (nsis + portable)
npm run dist:linux           # Linux (AppImage + deb)
```

Output is written to `./release/`.

## Scripts Reference

<div align="center">

| Command | Description |
|---|---|
| `npm run dev` | Start in dev mode with live rebuilds |
| `npm run build` | Production build without launching |
| `npm start` | Build and launch |
| `npm run dist` | Package for current platform |
| `npm run clean` | Remove `dist/`, `release/`, and generated icons |
| `npm run preflight` | Verify assets, config, and deps before packaging |
| `npm run icons` | Generate platform icon sets from source SVG |
| `npm run pack` | Unpacked directory build for testing |

</div>

## How It Works

Orbit discovers VS Code Copilot Chat log files from standard storage locations:

<div align="center">

| Platform | Path |
|---|---|
| macOS | `~/Library/Application Support/Code/` and `Code - Insiders/` |
| Linux | `~/.config/Code/` and `Code - Insiders/` |
| Windows | `%APPDATA%/Code/` and `Code - Insiders/` |

</div>

Log parsing runs in a **worker thread** to keep the UI responsive. Parsed sessions are cached to disk using a SHA-256 fingerprint and invalidated automatically when files change. All analytics are computed locally and in-memory -- no data leaves your machine.

## Privacy and Security

- **Local-only** -- no telemetry, no cloud sync, no external calls from core functionality.
- **Read-only** -- Orbit never modifies or deletes VS Code log files.
- **Sandboxed** -- Electron runs with `contextIsolation: true` and `nodeIntegration: false`.
- **AI opt-in** -- The optional Copilot SDK agent is the only feature that communicates externally. It sends only aggregated statistics (never raw chat messages, code, or file paths) and must be explicitly triggered.

<div align="center">

---

<sub>MIT License</sub>

</div>
