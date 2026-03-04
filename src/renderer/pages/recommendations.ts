/* Recommendations page – local checks + optional AI analysis */
import { Chart } from 'chart.js';
import { getGlobalWorkspace, trackChart } from '../app';

/* ---- Threshold metadata for each local check ---- */
interface CheckMeta {
  thresholds: { label: string; min: number; max: number; color: string }[];
  background: string;
  howToImprove: string[];
}

const CHECK_META: Record<string, CheckMeta> = {
  'model-switch': {
    thresholds: [
      { label: 'Critical', min: 0, max: 40, color: '#f85149' },
      { label: 'Needs Improvement', min: 40, max: 70, color: '#d29922' },
      { label: 'Good', min: 70, max: 100, color: '#3fb950' },
    ],
    background: 'Model diversity measures how many different AI models you use and whether you over-rely on a single model. Using multiple models lets you pick the right tool for each task — lighter models for simple work and premium models for complex reasoning.',
    howToImprove: [
      'Use GPT-4o-mini or Gemini Flash for docs, comments, and small edits.',
      'Reserve Claude Sonnet / GPT-4o for complex debugging and architectural work.',
      'Try switching models mid-session when switching task types.',
      'Keep your top-model usage below 60% of total requests.',
    ],
  },
  'model-task-align': {
    thresholds: [
      { label: 'Critical', min: 0, max: 40, color: '#f85149' },
      { label: 'Needs Improvement', min: 40, max: 70, color: '#d29922' },
      { label: 'Good', min: 70, max: 100, color: '#3fb950' },
    ],
    background: 'Model-task alignment checks whether you are using appropriately-sized models for each task type. Light tasks (docs, config, styling) should use cheaper models, while complex tasks (features, bug fixes, refactoring) benefit from premium models.',
    howToImprove: [
      'Categorize your work before starting: is it a quick fix or deep reasoning?',
      'Set up model presets for different task types in your editor.',
      'Avoid using premium models for boilerplate generation.',
      'Match model capability to task complexity for faster responses and lower cost.',
    ],
  },
  'planning-mode': {
    thresholds: [
      { label: 'Critical', min: 0, max: 30, color: '#f85149' },
      { label: 'Needs Improvement', min: 30, max: 60, color: '#d29922' },
      { label: 'Good', min: 60, max: 100, color: '#3fb950' },
    ],
    background: 'Planning mode usage measures how often you begin complex sessions with a structured plan. Starting with "plan this out" or "break it down step by step" helps the AI produce higher-quality, more organized output.',
    howToImprove: [
      'Start complex tasks with: "Let\'s plan this out first."',
      'Ask the AI to break down multi-step work before coding.',
      'Use structured prompts for features: requirements then implementation then tests.',
      'Only multi-turn sessions (3+ messages) are evaluated — short queries are fine as-is.',
    ],
  },
  'context-flush': {
    thresholds: [
      { label: 'Critical', min: 0, max: 40, color: '#f85149' },
      { label: 'Needs Improvement', min: 40, max: 70, color: '#d29922' },
      { label: 'Good', min: 70, max: 100, color: '#3fb950' },
    ],
    background: 'Context management measures whether your sessions stay focused. Very long sessions (30+ messages) cause the AI\'s context window to fill up, leading to degraded quality, forgotten instructions, and slower responses.',
    howToImprove: [
      'Start a new session when switching to a different task or file.',
      'Aim for sessions of 15-25 messages for optimal quality.',
      'Use /clear or start fresh if the conversation drifts.',
      'Keep less than 5% of sessions over 30 messages.',
    ],
  },
  'slash-commands': {
    thresholds: [
      { label: 'Critical', min: 0, max: 30, color: '#f85149' },
      { label: 'Needs Improvement', min: 30, max: 60, color: '#d29922' },
      { label: 'Good', min: 60, max: 100, color: '#3fb950' },
    ],
    background: 'Slash commands (/explain, /fix, /tests, /docs, etc.) are purpose-built shortcuts that produce faster, more targeted results than equivalent natural language prompts. Using a variety of commands shows mastery of the tool.',
    howToImprove: [
      'Learn the available commands: /explain, /fix, /tests, /docs, /new, /clear.',
      'Use /explain instead of "can you explain this code?"',
      'Use /fix for quick bug fixes instead of describing the bug in prose.',
      'Try /tests to auto-generate test cases for selected code.',
    ],
  },
  'feature-usage': {
    thresholds: [
      { label: 'Critical', min: 0, max: 30, color: '#f85149' },
      { label: 'Needs Improvement', min: 30, max: 60, color: '#d29922' },
      { label: 'Good', min: 60, max: 100, color: '#3fb950' },
    ],
    background: 'Feature utilization tracks how many of Copilot\'s 6 key capabilities you use: tools, file editing, file references, agents, slash commands, and context variables (#file, @workspace). Broader usage leads to more effective AI assistance.',
    howToImprove: [
      'Reference files with #file to give the AI precise context.',
      'Use @workspace for project-wide questions.',
      'Try different agents for specialized tasks.',
      'Use tools (terminal, search) through Copilot for integrated workflows.',
    ],
  },
  'parallelism': {
    thresholds: [
      { label: 'Critical', min: 0, max: 30, color: '#f85149' },
      { label: 'Needs Improvement', min: 30, max: 60, color: '#d29922' },
      { label: 'Good', min: 60, max: 100, color: '#3fb950' },
    ],
    background: 'Session parallelism measures whether you run multiple Copilot sessions concurrently. Parallel sessions let you work on different aspects simultaneously — e.g., one session for backend logic and another for frontend, keeping context focused in each.',
    howToImprove: [
      'Open separate chat sessions for separate tasks or files.',
      'Use different workspaces for different projects.',
      'Run parallel sessions when working on front-end and back-end simultaneously.',
      'Don\'t try to do everything in a single long conversation.',
    ],
  },
  'cancellation': {
    thresholds: [
      { label: 'Good', min: 70, max: 100, color: '#3fb950' },
      { label: 'Needs Improvement', min: 40, max: 70, color: '#d29922' },
      { label: 'Critical', min: 0, max: 40, color: '#f85149' },
    ],
    background: 'Cancellation rate tracks how often you stop a request before it finishes. A high rate suggests prompts may be unclear, leading to unexpected output. Some cancellation is normal, but consistent cancellation wastes time and tokens.',
    howToImprove: [
      'Write clearer, more specific prompts to get the right output first try.',
      'Provide context (files, examples) so the AI understands what you need.',
      'Use a lighter/faster model if you\'re canceling due to slow responses.',
      'Break large asks into smaller, focused requests.',
    ],
  },
  'tool-diversity': {
    thresholds: [
      { label: 'Critical', min: 0, max: 30, color: '#f85149' },
      { label: 'Needs Improvement', min: 30, max: 60, color: '#d29922' },
      { label: 'Good', min: 60, max: 100, color: '#3fb950' },
    ],
    background: 'Tool diversity measures how many different tools (terminal, file search, code search, browser, etc.) you use through Copilot. Using a wider range of tools lets the AI help you across more of your workflow.',
    howToImprove: [
      'Let Copilot run terminal commands for build/test workflows.',
      'Use the search tools to find code references across your project.',
      'Try browser tools for documentation lookups.',
      'Explore all available tools in your Copilot agent configuration.',
    ],
  },
  'response-time': {
    thresholds: [
      { label: 'Critical', min: 0, max: 40, color: '#f85149' },
      { label: 'Needs Improvement', min: 40, max: 70, color: '#d29922' },
      { label: 'Good', min: 70, max: 100, color: '#3fb950' },
    ],
    background: 'Response time efficiency measures how many of your requests take over 30 seconds to complete. Slow requests often indicate overly complex prompts or using heavy models for simple tasks. Optimizing prompt size and model choice reduces wait time.',
    howToImprove: [
      'Break complex prompts into smaller, focused questions.',
      'Use lighter models (GPT-4o-mini, Gemini Flash) for simple tasks.',
      'Reduce context size by referencing only needed files.',
      'Avoid pasting large code blocks — use #file references instead.',
    ],
  },
  'file-refs': {
    thresholds: [
      { label: 'Critical', min: 0, max: 30, color: '#f85149' },
      { label: 'Needs Improvement', min: 30, max: 60, color: '#d29922' },
      { label: 'Good', min: 60, max: 100, color: '#3fb950' },
    ],
    background: 'Context providing measures how often your requests include file references or file edits. Providing explicit file context (via #file, @workspace, or active editor) helps the AI understand your codebase and produce more accurate responses.',
    howToImprove: [
      'Use #file:path/to/file to attach specific files to your prompt.',
      'Use @workspace for project-wide context when asking architectural questions.',
      'Keep relevant files open in the editor — Copilot can see your active tabs.',
      'Aim for at least 50% of requests to include some file context.',
    ],
  },
  'session-length': {
    thresholds: [
      { label: 'Critical', min: 0, max: 40, color: '#f85149' },
      { label: 'Needs Improvement', min: 40, max: 70, color: '#d29922' },
      { label: 'Good', min: 70, max: 100, color: '#3fb950' },
    ],
    background: 'Session length optimization checks the distribution of your session sizes. Too many single-message sessions means you\'re not leveraging conversation history. Too many very long sessions (50+) means context quality is degrading. The sweet spot is 5-25 messages.',
    howToImprove: [
      'Follow up on AI responses — iterate within the same session.',
      'Start new sessions when the topic changes, not mid-conversation.',
      'Aim for an average session length of 5-25 messages.',
      'Keep very long sessions (50+) under 10% of total.',
    ],
  },
};

/* ---- Active detail charts (cleaned up on re-render) ---- */
const detailCharts: Chart[] = [];
function destroyDetailCharts() {
  while (detailCharts.length) { const c = detailCharts.pop(); c?.destroy(); }
}

export async function renderBehavior(container: HTMLElement): Promise<void> {
  container.innerHTML = `
    <div class="page-header">
      <h1>Behavior Analysis</h1>
      <p>Rule-based insights into your Copilot usage patterns</p>
    </div>
    <div id="rec-content">
      <div class="loading-inline"><div class="loading-spinner"></div>Analyzing...</div>
    </div>
  `;

  await loadLocalChecks();
}

export async function renderAgentic(container: HTMLElement): Promise<void> {
  container.innerHTML = `
    <div class="page-header">
      <h1>Agentic Insights</h1>
      <p>AI-powered deep analysis of your development patterns</p>
    </div>
    <div id="rec-content"><div class="loading-inline"><div class="loading-spinner"></div>Loading...</div></div>
  `;

  // Try to load persisted results
  const saved = await window.orbit.loadAgentResults();
  if (saved && saved.checks && saved.checks.length > 0) {
    const el = document.getElementById('rec-content');
    if (el) {
      renderAIResults(el, saved.checks, null, saved.elapsed || '—', 'all', 'all', 'severity');
      // Add re-run button above results
      const rerun = document.createElement('div');
      rerun.style.cssText = 'margin-bottom:12px;display:flex;align-items:center;gap:10px;flex-wrap:wrap';
      const savedScope = saved.workspace && saved.workspace !== 'all' ? saved.workspace : 'All Workspaces';
      rerun.innerHTML = `
        <select id="ai-model-select" class="agent-model-select">
          <option value="gpt-5-mini" selected>GPT-5 Mini (free)</option>
          <option value="claude-opus-4.5">Claude Opus 4.5 (3x premium)</option>
        </select>
        <button class="pill active" id="btn-run-ai">Re-run Analysis</button>
        <span class="text-xs text-muted">Last run: ${escapeHtml(saved.timestamp || 'unknown')} &middot; Scope: ${escapeHtml(savedScope)}</span>
      `;
      el.prepend(rerun);
      attachRunButton(el);
      attachAIResultsInteraction(el, saved.checks, saved.elapsed || '—');
    }
  } else {
    await loadAIChecks();
  }
}

async function loadLocalChecks() {
  const el = document.getElementById('rec-content');
  if (!el) return;
  el.innerHTML = '<div class="loading-inline"><div class="loading-spinner"></div>Analyzing...</div>';

  const results = await window.orbit.getRecommendations(getGlobalWorkspace());
  if (!results || !Array.isArray(results) || results.length === 0) {
    el.innerHTML = '<div class="empty-state"><h3>No recommendations available</h3></div>';
    return;
  }

  // Group by category
  const byCategory = new Map<string, any[]>();
  for (const r of results) {
    const cat = r.category || 'general';
    if (!byCategory.has(cat)) byCategory.set(cat, []);
    byCategory.get(cat)!.push(r);
  }

  // Overall score
  const avgScore = Math.round(results.reduce((a: number, r: any) => a + r.score, 0) / results.length);
  const critical = results.filter((r: any) => r.status === 'critical').length;
  const needsImprove = results.filter((r: any) => r.status === 'needs-improvement').length;
  const good = results.filter((r: any) => r.status === 'good').length;

  let html = `
    <div class="stats-row mb-16">
      <div class="stat-card">
        <div class="stat-label">Overall Score</div>
        <div class="stat-value ${avgScore >= 70 ? 'green' : avgScore >= 40 ? 'orange' : 'red'}">${avgScore}</div>
        <div class="stat-sub">out of 100</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Good</div>
        <div class="stat-value green">${good}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Needs Work</div>
        <div class="stat-value orange">${needsImprove}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Critical</div>
        <div class="stat-value red">${critical}</div>
      </div>
    </div>

    <div class="card mb-16">
      <div class="card-title">Score Overview</div>
      <div style="position:relative;width:100%;max-width:520px;margin:0 auto">
        <canvas id="rec-radar-chart"></canvas>
      </div>
    </div>
  `;

  for (const [category, checks] of byCategory) {
    html += `<div class="text-xs text-subtle mb-8 mt-16" style="text-transform:uppercase;letter-spacing:0.5px">${formatCategory(category)}</div>`;
    for (const r of checks) {
      const cls = r.status === 'critical' ? 'high' : r.status === 'needs-improvement' ? 'medium' : 'low';
      html += `
        <div class="rec-card ${cls} rec-card-clickable" data-check-id="${escapeHtml(r.checkId)}" data-score="${r.score}">
          <div class="rec-title">
            ${escapeHtml(r.name)}
            <span class="rec-badge ${cls}">${r.status === 'critical' ? 'Critical' : r.status === 'needs-improvement' ? 'Improve' : 'Good'}</span>
            <span class="text-sm text-subtle" style="margin-left:auto">Score: ${r.score}/100</span>
            <span class="rec-expand-icon">&#9654;</span>
          </div>
          <div class="rec-body">
            <p><strong>Finding:</strong> ${escapeHtml(r.finding)}</p>
            <p style="margin-top:4px"><strong>Recommendation:</strong> ${escapeHtml(r.recommendation)}</p>
          </div>
          <div class="rec-detail" id="rec-detail-${escapeHtml(r.checkId)}" style="display:none">
            <div class="rec-detail-inner">
              <div class="rec-detail-info">
                <div class="rec-detail-section">
                  <h4>Background</h4>
                  <p>${escapeHtml(CHECK_META[r.checkId]?.background || 'No additional information available for this check.')}</p>
                </div>
                <div class="rec-detail-section">
                  <h4>How to Improve</h4>
                  <ul class="rec-improve-list">
                    ${(CHECK_META[r.checkId]?.howToImprove || []).map(tip => `<li>${escapeHtml(tip)}</li>`).join('')}
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      `;
    }
  }

  el.innerHTML = html;

  // Render radar chart showing all check scores
  renderRadarChart(results);

  // Attach click handlers to expand/collapse detail panels
  el.querySelectorAll('.rec-card-clickable').forEach(card => {
    card.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (target.closest('a, button')) return;

      const cardEl = card as HTMLElement;
      const checkId = cardEl.dataset.checkId!;
      const detail = document.getElementById(`rec-detail-${checkId}`);
      if (!detail) return;

      const isOpen = detail.style.display !== 'none';
      // Close all open details first
      el.querySelectorAll('.rec-detail').forEach(d => (d as HTMLElement).style.display = 'none');
      el.querySelectorAll('.rec-card-clickable').forEach(c => c.classList.remove('rec-card-expanded'));
      destroyDetailCharts();

      if (!isOpen) {
        detail.style.display = 'block';
        cardEl.classList.add('rec-card-expanded');
      }
    });
  });
}

const TOOL_LABELS: Record<string, string> = {
  get_model_usage: 'Model Usage Stats',
  get_prompt_quality_data: 'Prompt Quality Data',
  get_session_patterns: 'Session Patterns',
  get_code_review_patterns: 'Code Review Patterns',
  get_hourly_distribution: 'Hourly Distribution',
  get_weekend_patterns: 'Weekend Patterns',
  get_session_durations: 'Session Durations',
  get_weekly_intensity: 'Weekly Intensity',
  get_daily_boundaries: 'Daily Boundaries',
  get_monthly_progression: 'Monthly Progression',
  get_parallelism_stats: 'Parallelism Stats',
};

const CATEGORY_ICONS: Record<string, string> = {
  'model-usage': '\u2699',
  'workflow': '\u21BB',
  'context': '\u2630',
  'efficiency': '\u26A1',
};

const CATEGORY_LABELS: Record<string, string> = {
  'model-usage': 'Model Usage',
  'workflow': 'Workflow',
  'context': 'Context Quality',
  'efficiency': 'Efficiency',
};

const STATUS_ORDER: Record<string, number> = { critical: 0, 'needs-improvement': 1, good: 2 };

async function loadAIChecks() {
  const el = document.getElementById('rec-content');
  if (!el) return;
  el.innerHTML = `
    <div class="card">
      <div class="card-title">AI-Powered Analysis</div>
      <p class="text-muted mb-16">Uses GitHub Copilot to analyze your usage patterns in depth. Requires <code>gh</code> CLI authentication or GITHUB_TOKEN.</p>
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
        <select id="ai-model-select" class="agent-model-select">
          <option value="gpt-5-mini" selected>GPT-5 Mini (free)</option>
          <option value="claude-opus-4.5">Claude Opus 4.5 (3x premium)</option>
        </select>
        <button class="pill active" id="btn-run-ai">Run AI Analysis</button>
      </div>
      <div id="ai-results" class="mt-16"></div>
    </div>
  `;

  attachRunButton(el);
}

function attachRunButton(root: HTMLElement) {
  root.querySelector('#btn-run-ai')?.addEventListener('click', () => runAIAnalysis());
}

export async function runAIAnalysis() {
  const el = document.getElementById('rec-content');
  if (!el) return;

  const modelSelect = document.getElementById('ai-model-select') as HTMLSelectElement | null;
  const selectedModel = modelSelect?.value || 'gpt-5-mini';

  // Replace content with activity feed
  el.innerHTML = `
    <div class="agent-activity">
      <div class="agent-activity-header">
        <div class="loading-spinner"></div>
        <span id="agent-status">Initializing...</span>
      </div>
      <div class="agent-activity-feed" id="agent-feed"></div>
    </div>
  `;

  const feedEl = document.getElementById('agent-feed')!;
  const statusEl = document.getElementById('agent-status')!;
  const startTime = Date.now();

  function elapsed(): string {
    const s = Math.floor((Date.now() - startTime) / 1000);
    return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
  }

  function addEntry(icon: string, text: string, cls: string = '') {
    const row = document.createElement('div');
    row.className = 'agent-feed-entry' + (cls ? ` ${cls}` : '');
    row.innerHTML = `<span class="agent-feed-icon">${icon}</span><span class="agent-feed-text">${text}</span><span class="agent-feed-time">${elapsed()}</span>`;
    feedEl.appendChild(row);
    feedEl.scrollTop = feedEl.scrollHeight;
  }

  const progressHandler = (event: any) => {
    switch (event.type) {
      case 'status':
        statusEl.textContent = event.message;
        addEntry('\u25B6', escapeHtml(event.message));
        break;
      case 'tool-call':
        statusEl.textContent = `Calling ${TOOL_LABELS[event.tool] || event.tool}...`;
        addEntry('\u2699', `Tool call: <strong>${escapeHtml(TOOL_LABELS[event.tool] || event.tool)}</strong>`, 'tool-call');
        break;
      case 'tool-result':
        addEntry('\u2713', `${escapeHtml(TOOL_LABELS[event.tool] || event.tool)} returned data`, 'tool-result');
        break;
      case 'thinking':
        statusEl.textContent = event.message;
        addEntry('\u2726', escapeHtml(event.message), 'thinking');
        break;
      case 'error':
        statusEl.textContent = 'Error';
        addEntry('\u2717', `Error: ${escapeHtml(event.message)}`, 'error');
        break;
      case 'done':
        statusEl.textContent = `Complete (${elapsed()})`;
        break;
    }
  };
  window.orbit.onAgentProgress(progressHandler);

  const data = await window.orbit.getAgentAnalysis(getGlobalWorkspace(), selectedModel);

  if (!data || data.error || !data.checks || data.checks.length === 0) {
    el.innerHTML = `<div class="empty-state"><h3>${data?.error ? 'Not Available' : 'No results'}</h3>${data?.error ? `<p>${escapeHtml(data.error)}</p><p class="text-xs mt-8">Run <code>gh auth login</code> or set GITHUB_TOKEN environment variable.</p>` : ''}</div>`;
    return;
  }

  const checks: any[] = data.checks;
  const elapsedStr = elapsed();
  const timestamp = new Date().toLocaleString();

  // Persist results to disk
  await window.orbit.saveAgentResults({
    checks,
    elapsed: elapsedStr,
    timestamp,
    workspace: getGlobalWorkspace() || 'all',
    model: selectedModel,
  });

  // Render results
  const activityLogHtml = feedEl.outerHTML;
  renderAIResults(el, checks, activityLogHtml, elapsedStr, 'all', 'all', 'severity');

  // Add re-run button
  const rerun = document.createElement('div');
  rerun.style.cssText = 'margin-bottom:12px;display:flex;align-items:center;gap:10px;flex-wrap:wrap';
  const currentScope = getGlobalWorkspace() || 'All Workspaces';
  rerun.innerHTML = `
    <select id="ai-model-select" class="agent-model-select">
      <option value="gpt-5-mini" ${selectedModel === 'gpt-5-mini' ? 'selected' : ''}>GPT-5 Mini (free)</option>
      <option value="claude-opus-4.5" ${selectedModel === 'claude-opus-4.5' ? 'selected' : ''}>Claude Opus 4.5 (3x premium)</option>
    </select>
    <button class="pill active" id="btn-run-ai">Re-run Analysis</button>
    <span class="text-xs text-muted">Last run: ${escapeHtml(timestamp)} &middot; Scope: ${escapeHtml(currentScope)}</span>
  `;
  el.prepend(rerun);
  attachRunButton(el);
  attachAIResultsInteraction(el, checks, elapsedStr);
}

function attachAIResultsInteraction(container: HTMLElement, checks: any[], elapsedStr: string) {
  let activeCategory = 'all';
  let activeSeverity = 'all';
  let sortBy = 'severity';

  container.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const catPill = target.closest('[data-ai-category]') as HTMLElement | null;
    if (catPill) {
      activeCategory = catPill.dataset.aiCategory!;
      renderAIResults(container, checks, null, elapsedStr, activeCategory, activeSeverity, sortBy);
      return;
    }
    const sevPill = target.closest('[data-ai-severity]') as HTMLElement | null;
    if (sevPill) {
      activeSeverity = sevPill.dataset.aiSeverity!;
      renderAIResults(container, checks, null, elapsedStr, activeCategory, activeSeverity, sortBy);
      return;
    }
  });

  container.addEventListener('change', (e) => {
    const target = e.target as HTMLElement;
    if (target.id === 'ai-sort-select') {
      sortBy = (target as HTMLSelectElement).value;
      renderAIResults(container, checks, null, elapsedStr, activeCategory, activeSeverity, sortBy);
    }
  });
}

function renderAIResults(
  container: HTMLElement,
  allChecks: any[],
  activityLogHtml: string | null,
  elapsedStr: string,
  activeCategory: string,
  activeSeverity: string,
  sortBy: string,
) {
  // Filter
  let checks = allChecks;
  if (activeCategory !== 'all') {
    checks = checks.filter(r => r.category === activeCategory);
  }
  if (activeSeverity !== 'all') {
    checks = checks.filter(r => r.status === activeSeverity);
  }

  // Sort
  checks = [...checks];
  if (sortBy === 'severity') {
    checks.sort((a, b) => (STATUS_ORDER[a.status] ?? 2) - (STATUS_ORDER[b.status] ?? 2));
  } else if (sortBy === 'score-asc') {
    checks.sort((a, b) => a.score - b.score);
  } else if (sortBy === 'score-desc') {
    checks.sort((a, b) => b.score - a.score);
  } else if (sortBy === 'name') {
    checks.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  } else if (sortBy === 'category') {
    checks.sort((a, b) => (a.category || '').localeCompare(b.category || ''));
  }

  // Compute stats from full set (unfiltered)
  const avgScore = Math.round(allChecks.reduce((a: number, r: any) => a + r.score, 0) / allChecks.length);
  const critical = allChecks.filter((r: any) => r.status === 'critical').length;
  const needsImprove = allChecks.filter((r: any) => r.status === 'needs-improvement').length;
  const good = allChecks.filter((r: any) => r.status === 'good').length;

  // Collect categories
  const categories = [...new Set(allChecks.map(r => r.category || 'unknown'))].sort();

  // Category scores
  const categoryScores: Record<string, { total: number; count: number; worst: string }> = {};
  for (const r of allChecks) {
    const cat = r.category || 'unknown';
    if (!categoryScores[cat]) categoryScores[cat] = { total: 0, count: 0, worst: 'good' };
    categoryScores[cat].total += r.score;
    categoryScores[cat].count++;
    if ((STATUS_ORDER[r.status] ?? 2) < (STATUS_ORDER[categoryScores[cat].worst] ?? 2)) {
      categoryScores[cat].worst = r.status;
    }
  }

  let html = '';

  // Activity log (collapsible, only on first render)
  if (activityLogHtml) {
    html += `
      <details class="agent-log-details">
        <summary class="text-sm text-muted" style="cursor:pointer;margin-bottom:12px">Agent Activity Log (${elapsedStr})</summary>
        ${activityLogHtml}
      </details>
    `;
  }

  // Unified summary: overall score + category breakdown in one row
  html += `<div class="ai-summary-row mb-16">`;
  html += `
    <div class="ai-score-card">
      <div class="ai-score-big ${avgScore >= 70 ? 'green' : avgScore >= 40 ? 'orange' : 'red'}">${avgScore}</div>
      <div class="ai-score-label">Overall Score</div>
      <div class="ai-score-breakdown">
        <span class="green">${good} good</span>
        <span class="orange">${needsImprove} needs work</span>
        <span class="red">${critical} critical</span>
      </div>
    </div>
  `;
  for (const cat of categories) {
    const cs = categoryScores[cat];
    const catAvg = Math.round(cs.total / cs.count);
    const icon = CATEGORY_ICONS[cat] || '\u2022';
    const label = CATEGORY_LABELS[cat] || formatCategory(cat);
    const worstCls = cs.worst === 'critical' ? 'red' : cs.worst === 'needs-improvement' ? 'orange' : 'green';
    const isActive = activeCategory === cat;
    html += `
      <div class="ai-cat-card ${isActive ? 'ai-cat-card-active' : ''}" data-ai-category="${escapeHtml(cat)}">
        <div class="ai-cat-icon">${icon}</div>
        <div class="ai-cat-label">${escapeHtml(label)}</div>
        <div class="ai-cat-score ${worstCls}">${catAvg}</div>
        <div class="ai-cat-count">${cs.count} check${cs.count > 1 ? 's' : ''}</div>
      </div>
    `;
  }
  html += `</div>`;

  // Filter & sort toolbar
  html += `
    <div class="ai-toolbar mb-16">
      <div class="ai-filter-group">
        <span class="ai-filter-label">Severity:</span>
        <button class="pill small ${activeSeverity === 'all' ? 'active' : ''}" data-ai-severity="all">All</button>
        <button class="pill small pill-red ${activeSeverity === 'critical' ? 'active' : ''}" data-ai-severity="critical">Critical</button>
        <button class="pill small pill-orange ${activeSeverity === 'needs-improvement' ? 'active' : ''}" data-ai-severity="needs-improvement">Needs Work</button>
        <button class="pill small pill-green ${activeSeverity === 'good' ? 'active' : ''}" data-ai-severity="good">Good</button>
      </div>
      <div class="ai-filter-group">
        <span class="ai-filter-label">Category:</span>
        <button class="pill small ${activeCategory === 'all' ? 'active' : ''}" data-ai-category="all">All</button>
        ${categories.map(cat => `<button class="pill small ${activeCategory === cat ? 'active' : ''}" data-ai-category="${escapeHtml(cat)}">${escapeHtml(CATEGORY_LABELS[cat] || formatCategory(cat))}</button>`).join('')}
      </div>
      <div class="ai-filter-group">
        <span class="ai-filter-label">Sort:</span>
        <select id="ai-sort-select" class="agent-model-select">
          <option value="severity" ${sortBy === 'severity' ? 'selected' : ''}>Severity (worst first)</option>
          <option value="score-asc" ${sortBy === 'score-asc' ? 'selected' : ''}>Score (low to high)</option>
          <option value="score-desc" ${sortBy === 'score-desc' ? 'selected' : ''}>Score (high to low)</option>
          <option value="category" ${sortBy === 'category' ? 'selected' : ''}>Category</option>
          <option value="name" ${sortBy === 'name' ? 'selected' : ''}>Name (A-Z)</option>
        </select>
      </div>
    </div>
  `;

  // Showing count
  html += `<div class="text-xs text-subtle mb-8">${checks.length} of ${allChecks.length} insights</div>`;

  // Group by category if sorted by category, otherwise flat list
  if (sortBy === 'category') {
    const grouped = new Map<string, any[]>();
    for (const r of checks) {
      const cat = r.category || 'unknown';
      if (!grouped.has(cat)) grouped.set(cat, []);
      grouped.get(cat)!.push(r);
    }
    for (const [cat, items] of grouped) {
      const label = CATEGORY_LABELS[cat] || formatCategory(cat);
      const icon = CATEGORY_ICONS[cat] || '\u2022';
      html += `<div class="ai-group-header">${icon} ${escapeHtml(label)}</div>`;
      for (const r of items) {
        html += renderAICheckCard(r);
      }
    }
  } else {
    for (const r of checks) {
      html += renderAICheckCard(r);
    }
  }

  if (checks.length === 0) {
    html += `<div class="empty-state" style="padding:32px"><h3>No matching insights</h3><p>Try adjusting the filters above.</p></div>`;
  }

  container.innerHTML = html;
}

function renderAICheckCard(r: any): string {
  const cls = r.status === 'critical' ? 'high' : r.status === 'needs-improvement' ? 'medium' : 'low';
  const catLabel = CATEGORY_LABELS[r.category] || formatCategory(r.category || 'unknown');
  const scoreBarColor = r.score >= 70 ? '#3fb950' : r.score >= 40 ? '#d29922' : '#f85149';

  return `
    <div class="rec-card ${cls}">
      <div class="rec-title">
        ${escapeHtml(r.name)}
        <span class="rec-badge ${cls}">${r.status === 'critical' ? 'Critical' : r.status === 'needs-improvement' ? 'Improve' : 'Good'}</span>
        <span class="ai-cat-tag">${escapeHtml(catLabel)}</span>
        <span class="text-sm text-subtle" style="margin-left:auto;display:flex;align-items:center;gap:8px">
          <span class="ai-score-bar-inline"><span class="ai-score-bar-fill" style="width:${r.score}%;background:${scoreBarColor}"></span></span>
          ${r.score}/100
        </span>
      </div>
      <div class="rec-body">
        <p><strong>Finding:</strong> ${escapeHtml(r.finding)}</p>
        <p style="margin-top:4px"><strong>Recommendation:</strong> ${escapeHtml(r.recommendation)}</p>
        ${r.evidence && r.evidence.length ? `
          <details style="margin-top:8px">
            <summary class="text-sm text-muted" style="cursor:pointer">Evidence (${r.evidence.length})</summary>
            <ul style="margin-top:4px;padding-left:16px">${r.evidence.map((e: string) => `<li class="text-sm text-muted">${escapeHtml(e)}</li>`).join('')}</ul>
          </details>
        ` : ''}
      </div>
    </div>
  `;
}

function renderRadarChart(results: any[]) {
  const canvas = document.getElementById('rec-radar-chart') as HTMLCanvasElement | null;
  if (!canvas) return;

  const labels = results.map(r => r.name.replace(/\s+/g, ' '));
  const scores = results.map(r => r.score);
  const pointColors = results.map(r =>
    r.status === 'critical' ? '#f85149' : r.status === 'needs-improvement' ? '#d29922' : '#3fb950'
  );

  const chart = new Chart(canvas, {
    type: 'radar',
    data: {
      labels,
      datasets: [{
        label: 'Score',
        data: scores,
        backgroundColor: 'rgba(136,198,255,0.12)',
        borderColor: '#58a6ff',
        borderWidth: 2,
        pointBackgroundColor: pointColors,
        pointBorderColor: pointColors,
        pointRadius: 4,
        pointHoverRadius: 6,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      scales: {
        r: {
          beginAtZero: true,
          max: 100,
          ticks: {
            stepSize: 25,
            color: '#8b949e',
            backdropColor: 'transparent',
            font: { size: 10 },
          },
          grid: { color: 'rgba(139,148,158,0.15)' },
          angleLines: { color: 'rgba(139,148,158,0.15)' },
          pointLabels: {
            color: '#c9d1d9',
            font: { size: 11 },
            padding: 12,
          },
        },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx: any) => `Score: ${ctx.raw}/100`,
          },
        },
      },
    },
  });

  detailCharts.push(chart);
  trackChart(chart);
}

function formatCategory(cat: string): string {
  return cat.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function escapeHtml(str: string): string {
  const el = document.createElement('span');
  el.textContent = str;
  return el.innerHTML;
}
