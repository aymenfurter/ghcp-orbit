# Orbit -- Development Intelligence Dashboard

Specification and guardrails for building Orbit, a desktop analytics tool that surfaces GitHub Copilot usage patterns from local VS Code log files.

## Scope

Parse Copilot Chat session logs found in VS Code's `workspaceStorage` directories (Stable + Insiders) and present the data through a set of focused dashboard pages. The app is read-only -- it never modifies or uploads user data.

## Architecture Constraints

- **Electron** with context isolation and preload scripts. The renderer must never have direct access to Node APIs.
- All IPC between main and renderer goes through a typed context bridge. No `remote` module usage.
- Log parsing must run in a **worker thread** so the UI never freezes. Report progress back to the renderer via IPC events.
- Use **esbuild** for bundling. Target ES2022. Keep external: `electron`, `@github/copilot-sdk`, `vscode-jsonrpc`, `zod`.
- No heavyweight UI framework. Vanilla TypeScript in the renderer; Chart.js for visualizations only.

## Data & Parsing Rules

- Support both `.json` and `.jsonl` session formats. JSONL records use kind markers (`0`=init, `1`=set, `2`=append) to reconstruct state.
- Extract code blocks using standard markdown fencing. Count lines per language, mapping aliases to canonical names (e.g. `ts` -> `typescript`, `py` -> `python`).
- Classify work types (feature, bug fix, refactor, docs, test, etc.) via regex on message content. Keep classification deterministic -- no LLM calls for this.
- Normalize model names: strip suffixes like `-thought`, `-preview`; consolidate variants (e.g. `opus-41` -> `opus-4.5`).
- Cache parsed sessions to disk using a SHA-256 fingerprint of directory structure and mtimes. Invalidate on any change.

## Analytics & Cost Model

- Premium request cost: **$0.04** per request, scaled by per-model multiplier (0x-3x).
- 2010s equivalent baseline: **$20/LoC** for ROI comparison.
- Burndown projections: linear model based on daily consumption rate against monthly budget. Support Pro, Pro+, Business, and Enterprise SKUs.
- Concurrency analysis: bucket sessions into 1-minute intervals to derive max parallel sessions and focus mode percentage.

## Pages

Each page is a standalone module under `src/renderer/pages/`. All accept a workspace filter and must destroy their own Chart.js instances on teardown.

| Page | Purpose |
|------|---------|
| Dashboard | KPI summary, daily activity chart, top workspaces, hourly heatmap |
| Patterns | 7x24 heatmap, hourly work-type distribution, work-type breakdown |
| Production | AI vs user code, daily timeline, language and workspace breakdown |
| Consumption | Cost trends (daily/weekly/monthly), model usage table, cumulative tracking |
| Burndown | Monthly budget tracking with burndown chart and daily consumption bars |
| Timeline | Swim-lane Gantt of concurrent sessions with day/week/month modes |
| Journey | Per-workspace chronological story: work types, tech stack, model adoption |
| Sessions | Paginated session list with message thread detail view |
| Recommendations | 12 local rule-based behavior checks with radar chart |
| Agentic Insights | AI-powered analysis via Copilot SDK (requires GitHub auth) |

## Behavior Checks (Local)

The recommendation engine implements exactly 12 deterministic checks. Each produces a 0-100 score, a severity level, and actionable tips. No network calls.

1. Model diversity (`model-switch`)
2. Model-task alignment (`model-task-align`)
3. Planning-first usage (`planning-mode`)
4. Session length hygiene (`context-flush`) -- flag mega-sessions (50+ messages)
5. Slash command adoption (`slash-commands`)
6. Feature breadth (`feature-usage`)
7. Parallelism (`parallelism`)
8. Cancellation rate (`cancellation`)
9. Tool diversity (`tool-diversity`)
10. Response efficiency (`response-time`)
11. File context usage (`file-refs`)
12. Session size distribution (`session-length`)

## AI Agent Integration

- Use `@github/copilot-sdk` for agentic analysis. Lazy-load via dynamic `import()` since it is ESM-only.
- Define tool functions that extract slices of analytics data; let the model reason over them.
- Cache AI results to disk with timestamps so users don't re-run expensive checks.
- The agent is strictly optional. All core analytics must work without it.

## UI Guardrails

- Dark theme only. Use GitHub's color palette (`#0d1117` canvas, `#e6edf3` text).
- Sidebar navigation grouped into four sections: Overview, Production, Activity, Intelligence.
- Stat cards use a fixed set of accent colors (blue, green, purple, orange, cyan).
- All charts must be responsive, register with a global tracker, and clean up on page navigation.
- macOS: draggable title bar region with native traffic light offset.

## Platform Support

- Discover VS Code log directories per platform:
  - macOS: `~/Library/Application Support/Code{, - Insiders}`
  - Linux: `~/.config/Code{, - Insiders}`
  - Windows: `%APPDATA%/Code{, - Insiders}`
- Normalize all paths to forward slashes internally. Decode `file://` URIs.

## Non-Goals

- No cloud sync or telemetry.
- No multi-user support.
- No persistent database -- in-memory analytics with file-based caching is sufficient.
- No light theme.
