<div align="center">

<img src="assets/icon.png" alt="Orbit" width="128" />

# Orbit

**Are you actually good at agentic coding? Find out.**

[![Electron](https://img.shields.io/badge/Electron-33-47848F?logo=electron&logoColor=white)](https://www.electronjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-lightgrey)]()

</div>

<br />

I keep getting asked the same question: **"How do I become a better agentic developer?"**

The honest answer is that most people have no idea how they actually use AI coding tools. They *think* they're prompting well, using the right models, and giving the agent enough autonomy -- but they've never measured any of it.

**Orbit fixes that.** It reads your local GitHub Copilot Chat logs from VS Code, runs 22 deterministic and AI-powered checks against your real usage data, and tells you exactly where you're wasting tokens, picking wrong models, under-delegating to agents, or repeating work that should be automated.

No surveys. No self-reporting. Just your actual behavior, analyzed.

<div align="center">
<img src="assets/dashboard.png" alt="Orbit Dashboard" width="800" />
</div>

<br />

> **100% local. Read-only. Zero telemetry. Your data never leaves your machine.**

---

## Why This Exists

Everyone talks about "prompting better" but nobody has data. Orbit gives you that data. It answers questions like:

- **Am I using the right model for the right task?** Bug fixes on GPT-4o-mini? Features on a deprecated model? Orbit flags it with specific sessions and examples.
- **Am I giving the agent enough autonomy?** If the AI keeps saying "please run this command" and you keep copy-pasting, you're doing it wrong. Orbit detects these patterns.
- **Am I wasting tokens on things a script could do?** Starting the dev server, running linters, checking build status -- Orbit finds repeated simple prompts and tells you to automate them.
- **Is my context management hurting quality?** 80-message mega-sessions degrade AI output. Orbit tracks session hygiene and tells you when to start fresh.
- **Am I actually using Copilot's full feature set?** Slash commands, file references, MCP servers, multi-agent delegation, planning mode -- most developers use less than 30% of what's available.

---

## What Orbit Analyzes

### 12 Deterministic Behavior Checks (Local, No Network)

Every check produces a 0-100 score, a severity level, and specific actionable tips with real examples from your sessions:

| Check | What It Measures |
|---|---|
| **Model Diversity** | Are you stuck on one model or exploring the right tool for each job? |
| **Model-Task Alignment** | Strong models for complex work, light models for docs -- are you matching correctly? |
| **Planning-First Usage** | Do you start complex sessions with a plan, or just dive in? |
| **Session Length Hygiene** | Are mega-sessions (50+ messages) degrading your AI output quality? |
| **Slash Command Adoption** | Are you using /explain, /fix, /tests, or typing everything longhand? |
| **Feature Breadth** | Tools, file refs, agents, context variables -- how much of Copilot do you actually use? |
| **Parallelism** | Are you running multiple sessions concurrently or bottlenecking on one? |
| **Cancellation Rate** | High cancel rates signal poor prompting or wrong model selection. |
| **Tool Diversity** | Are you leveraging the full range of agent tools? |
| **Response Efficiency** | Time spent waiting vs. productive output -- how efficient is each interaction? |
| **File Context Usage** | Are you giving the AI file references for precision, or making it guess? |
| **Session Size Distribution** | Healthy distribution vs. too many tiny or bloated sessions. |

### 10 AI-Powered Deep Checks (via GitHub Copilot SDK)

The AI agent explores your session data with purpose-built tools, forms a hypothesis, and validates it against evidence before reporting anything. Checks cover: multi-agent delegation, code review habits, MCP/doc context enrichment, markdown and spec-driven dev, model-task matching, session hygiene, agent autonomy gaps, repeated automatable prompts, tool overload, and outdated model usage.

Each finding is backed by specific sessions and tells you what you should have done instead.

---

## Pages

Dashboard, Patterns, Production, Consumption, Burndown, Timeline, Journey, Sessions, Recommendations, Agentic Insights.

> See the [full documentation](docs/README.md) for details and screenshots.

---

## Quick Start

### Prerequisites

- [Node.js](https://nodejs.org/) v18+
- VS Code with GitHub Copilot (that's where the logs come from)

### Install and Run

```bash
git clone <repo-url>
cd orbit
npm install
npm run dev
```

That's it. Orbit automatically discovers your Copilot Chat logs from VS Code and VS Code Insiders.

### Build for Distribution

```bash
npm run dist:mac             # macOS (dmg + zip)
npm run dist:win             # Windows (nsis + portable)
npm run dist:linux           # Linux (AppImage + deb)
```

---

## How It Works

Orbit reads Copilot Chat session logs from VS Code's standard `workspaceStorage` directories:

| Platform | Path |
|---|---|
| macOS | `~/Library/Application Support/Code/` and `Code - Insiders/` |
| Linux | `~/.config/Code/` and `Code - Insiders/` |
| Windows | `%APPDATA%/Code/` and `Code - Insiders/` |

- Log parsing runs in a **worker thread** so the UI never freezes
- Parsed sessions are **cached to disk** using SHA-256 fingerprints and auto-invalidated on changes
- All analytics are computed **locally and in-memory**
- Supports both `.json` and `.jsonl` session formats
- Work types (feature, bug fix, refactor, docs, test) are classified via deterministic regex -- no LLM calls

---

## The Agentic Insights Engine

The optional AI analysis (powered by `@github/copilot-sdk`) doesn't just run static rules. It works like this:

1. **Purpose-built tools** expose slices of your analytics data -- model usage summaries, prompt quality metrics, session patterns, code review habits, hourly distributions, and more.
2. **The AI agent forms hypotheses** about your behavior ("this user might not be delegating to multiple agents") and then **validates them against your actual session data** using those tools.
3. **Only confirmed findings are reported.** If the agent doesn't find strong evidence of an issue, it stays silent. No false alarms.
4. **Results are cached** with timestamps so you don't re-run expensive analysis unnecessarily.

The agent sends only aggregated statistics -- never raw chat messages, code, or file paths. It requires GitHub authentication and must be explicitly triggered.

---

## Privacy and Security

- **Local-only** -- zero telemetry, zero cloud sync, zero tracking
- **Read-only** -- Orbit never modifies or deletes any VS Code files
- **Sandboxed** -- Electron with `contextIsolation: true` and `nodeIntegration: false`
- **AI is opt-in** -- the Copilot SDK agent is the only feature that makes external calls, and it only sends aggregate stats

---

## Tech Stack

| Technology | Role |
|---|---|
| Electron | Desktop runtime with context isolation |
| Vanilla TypeScript | No UI framework, no bloat |
| Chart.js | All visualizations |
| esbuild | Fast builds targeting ES2022 |
| `@github/copilot-sdk` | Optional AI-powered analysis |
| electron-builder | Cross-platform packaging |

---

## Scripts Reference

| Command | Description |
|---|---|
| `npm run dev` | Dev mode with live rebuilds |
| `npm run build` | Production build |
| `npm start` | Build and launch |
| `npm run dist` | Package for current platform |
| `npm run clean` | Remove build artifacts |
| `npm run preflight` | Verify everything before packaging |
| `npm run icons` | Generate platform icon sets from SVG |
| `npm test` | Run tests |

---

## Contributing

Orbit is built for developers who want to get better at working with AI coding tools. If you have ideas for new checks, analytics pages, or agent tools -- PRs are welcome.

---

<div align="center">

<sub>MIT License</sub>

<sub>This project is not affiliated with, endorsed by, or sponsored by GitHub, Inc. or Microsoft Corporation. "GitHub Copilot" is a trademark of GitHub, Inc.</sub>

</div>
