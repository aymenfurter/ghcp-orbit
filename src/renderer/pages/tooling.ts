/* Tooling page — VS Code feature adoption, behavior changes, and customization analysis */
import { Chart } from 'chart.js';
import { trackChart, COLORS, fmtNum, getWorkspaceFilter } from '../app';
import { redact, isHidden } from '../redact';

const AGENT_MODE_COLORS: Record<string, string> = {
  'Agent Mode': '#58a6ff',
  'Edit Mode': '#3fb950',
  'Edit Mode v2': '#7ee787',
  'Chat Panel': '#bc8cff',
  'Workspace': '#d29922',
  'Notebook': '#f778ba',
  'Inline Editor': '#39d2c0',
  'Terminal': '#79c0ff',
  'CLI': '#f85149',
  'SWE Agent': '#d2a8ff',
  'Cloud Agent': '#56d4dd',
  'VS Code': '#e3b341',
};

const VAR_KIND_LABELS: Record<string, string> = {
  file: 'File References',
  promptFile: 'Custom Prompts (.prompt.md)',
  tool: 'MCP / Extension Tools',
  promptText: 'Inline Prompt Text',
  directory: 'Directory References',
  workspace: 'Workspace Context',
  image: 'Image Attachments',
  element: 'UI Elements',
  link: 'Web Links',
  symbol: 'Code Symbols',
  diagnostic: 'Diagnostics',
  toolset: 'Tool Sets',
};

const MCP_SERVER_LABELS: Record<string, string> = {
  mslearnmcp: 'Microsoft Learn',
  'msxp-dynamics': 'Dynamics 365',
  databricks: 'Databricks',
  playwright: 'Playwright',
  azuredevops: 'Azure DevOps',
  pylance: 'Pylance',
  'my-mcp-server': 'Custom MCP',
  azure: 'Azure',
  'gh-issues': 'GitHub Issues',
  markitdown: 'MarkItDown',
  microsoft: 'Microsoft',
};

export async function renderTooling(container: HTMLElement): Promise<void> {
  const data = await window.orbit.getTooling(getWorkspaceFilter());
  if (!data) {
    container.innerHTML = '<div class="empty-state"><h3>No tooling data available</h3></div>';
    return;
  }

  // Compute top-level stats
  const totalReqs = data.customization.totalRequests;
  const topMode = data.agentModes.find((m: any) => !isHidden('hiddenAgentModes', m.label));
  const customizationPct = totalReqs > 0
    ? Math.round((data.customization.totalInstructionRefs + data.customization.promptFileUsage + data.customization.promptTextUsage) / totalReqs * 100)
    : 0;
  const totalTools = data.toolCalls.reduce((s: number, t: { count: number }) => s + t.count, 0);
  const totalMcpCalls = data.mcpServers.reduce((s: number, srv: any) => s + srv.calls, 0);
  const totalSkillRefs = data.skills.reduce((s: number, sk: any) => s + sk.count, 0);

  container.innerHTML = `
    <div class="page-header">
      <h1>Tooling & Features</h1>
      <p>VS Code Copilot feature adoption, MCP server usage, skills, and behavior evolution</p>
    </div>

    <div class="stats-row">
      <div class="stat-card">
        <div class="stat-label">Primary Mode</div>
        <div class="stat-value blue">${topMode ? redact('hiddenAgentModes', topMode.label) : '—'}</div>
        <div class="stat-sub">${topMode ? Math.round(topMode.pct * 100) + '% of requests' : ''}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Customization Rate</div>
        <div class="stat-value purple">${customizationPct}%</div>
        <div class="stat-sub">requests with custom instructions</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Tool Calls</div>
        <div class="stat-value cyan">${fmtNum(totalTools)}</div>
        <div class="stat-sub">${data.toolCalls.length} distinct tools</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">MCP Servers</div>
        <div class="stat-value green">${data.mcpServers.length}</div>
        <div class="stat-sub">${fmtNum(totalMcpCalls)} total calls</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Skills Available</div>
        <div class="stat-value orange">${data.skills.length}</div>
        <div class="stat-sub">${fmtNum(totalSkillRefs)} references</div>
      </div>
    </div>

    <div class="grid-2">
      <div class="card">
        <div class="card-title">Interaction Mode Distribution</div>
        <div class="chart-wrap" style="height:300px"><canvas id="chart-modes"></canvas></div>
      </div>
      <div class="card">
        <div class="card-title">Mode Adoption Over Time</div>
        <div class="chart-wrap" style="height:300px"><canvas id="chart-modes-trend"></canvas></div>
      </div>
    </div>

    <div class="grid-2">
      <div class="card">
        <div class="card-title">MCP Server Usage</div>
        <div class="chart-wrap" style="height:300px"><canvas id="chart-mcp"></canvas></div>
      </div>
      <div class="card">
        <div class="card-title">MCP Usage Over Time</div>
        <div class="chart-wrap" style="height:300px"><canvas id="chart-mcp-trend"></canvas></div>
      </div>
    </div>

    <div class="grid-2">
      <div class="card">
        <div class="card-title">MCP Server Details</div>
        <div id="mcp-detail" class="breakdown-list" style="max-height:320px;overflow-y:auto"></div>
      </div>
      <div class="card">
        <div class="card-title">Skills Usage</div>
        <div id="skills-detail" class="breakdown-list" style="max-height:320px;overflow-y:auto"></div>
      </div>
    </div>

    <div class="grid-2">
      <div class="card">
        <div class="card-title">Context Variables Used</div>
        <div class="chart-wrap" style="height:280px"><canvas id="chart-context"></canvas></div>
      </div>
      <div class="card">
        <div class="card-title">Customization Depth</div>
        <div id="customization-detail" class="breakdown-list"></div>
      </div>
    </div>

    <div class="grid-2">
      <div class="card">
        <div class="card-title">Top Tool Calls (Agent Actions)</div>
        <div class="chart-wrap" style="height:320px"><canvas id="chart-tools"></canvas></div>
      </div>
      <div class="card">
        <div class="card-title">Tool Usage Over Time</div>
        <div class="chart-wrap" style="height:320px"><canvas id="chart-tools-trend"></canvas></div>
      </div>
    </div>

    <div class="card">
      <div class="card-title">Model Usage by Interaction Mode</div>
      <div id="model-mode-table" class="table-wrap"></div>
    </div>
  `;

  renderModesChart(data);
  renderModesTrend(data);
  renderMcpChart(data);
  renderMcpTrend(data);
  renderMcpDetail(data, container);
  renderSkillsDetail(data, container);
  renderContextChart(data);
  renderCustomizationDetail(data, container);
  renderToolsChart(data);
  renderToolsTrend(data);
  renderModelModeTable(data, container);
}

function renderModesChart(data: any): void {
  const modes = data.agentModes.slice(0, 8);
  const ctx = (document.getElementById('chart-modes') as HTMLCanvasElement).getContext('2d')!;
  trackChart(new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: modes.map((m: any) => redact('hiddenAgentModes', m.label)),
      datasets: [{
        data: modes.map((m: any) => m.count),
        backgroundColor: modes.map((m: any) => AGENT_MODE_COLORS[m.label] || COLORS[modes.indexOf(m) % COLORS.length]),
        borderWidth: 0,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { position: 'right', labels: { padding: 12, boxWidth: 12, font: { size: 11 } } },
        tooltip: {
          callbacks: {
            label: (ctx: any) => {
              const total = ctx.dataset.data.reduce((a: number, b: number) => a + b, 0);
              return `${ctx.label}: ${fmtNum(ctx.raw)} (${Math.round(ctx.raw / total * 100)}%)`;
            },
          },
        },
      },
    },
  }));
}

function renderModesTrend(data: any): void {
  const trends = data.weeklyTrends;
  if (!trends.labels.length) return;

  const datasets = Object.entries(trends.agentModeSeries).map(([mode, values], i) => ({
    label: redact('hiddenAgentModes', mode),
    data: values as number[],
    borderColor: AGENT_MODE_COLORS[mode] || COLORS[i % COLORS.length],
    backgroundColor: 'transparent',
    borderWidth: 2,
    tension: 0.3,
    pointRadius: 0,
    pointHitRadius: 8,
  }));

  const ctx = (document.getElementById('chart-modes-trend') as HTMLCanvasElement).getContext('2d')!;
  trackChart(new Chart(ctx, {
    type: 'line',
    data: { labels: trends.labels, datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      scales: {
        x: { ticks: { maxRotation: 45, font: { size: 10 } } },
        y: { beginAtZero: true, title: { display: true, text: 'Requests / week' } },
      },
      plugins: {
        legend: { position: 'top', labels: { boxWidth: 12, font: { size: 10 } } },
      },
    },
  }));
}

function renderContextChart(data: any): void {
  const kinds = data.variableKinds.filter((v: any) => v.count > 0).slice(0, 10);
  const ctx = (document.getElementById('chart-context') as HTMLCanvasElement).getContext('2d')!;
  trackChart(new Chart(ctx, {
    type: 'bar',
    data: {
      labels: kinds.map((k: any) => VAR_KIND_LABELS[k.kind] || k.kind),
      datasets: [{
        data: kinds.map((k: any) => k.count),
        backgroundColor: kinds.map((_: any, i: number) => COLORS[i % COLORS.length]),
        borderWidth: 0,
        borderRadius: 4,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      indexAxis: 'y',
      scales: {
        x: { beginAtZero: true },
        y: { ticks: { font: { size: 10 } } },
      },
      plugins: { legend: { display: false } },
    },
  }));
}

function renderMcpChart(data: any): void {
  const servers = data.mcpServers || [];
  if (servers.length === 0) {
    const canvas = document.getElementById('chart-mcp') as HTMLCanvasElement;
    if (canvas && canvas.parentElement) {
      canvas.parentElement.innerHTML = '<div class="empty-state" style="padding:40px 0"><p>No MCP server usage detected</p></div>';
    }
    return;
  }

  const top = servers.slice(0, 10);
  const ctx = (document.getElementById('chart-mcp') as HTMLCanvasElement).getContext('2d')!;
  trackChart(new Chart(ctx, {
    type: 'bar',
    data: {
      labels: top.map((s: any) => isHidden('hiddenMcpServers', s.name) ? redact('hiddenMcpServers', s.name) : (MCP_SERVER_LABELS[s.name] || s.name)),
      datasets: [{
        data: top.map((s: any) => s.calls),
        backgroundColor: top.map((_: any, i: number) => COLORS[i % COLORS.length]),
        borderWidth: 0,
        borderRadius: 4,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      indexAxis: 'y',
      scales: {
        x: { beginAtZero: true, title: { display: true, text: 'Tool calls' } },
        y: { ticks: { font: { size: 11 } } },
      },
      plugins: { legend: { display: false } },
    },
  }));
}

function renderMcpTrend(data: any): void {
  const trends = data.weeklyTrends;
  if (!trends.labels.length || !Object.keys(trends.mcpServerSeries).length) {
    const canvas = document.getElementById('chart-mcp-trend') as HTMLCanvasElement;
    if (canvas && canvas.parentElement) {
      canvas.parentElement.innerHTML = '<div class="empty-state" style="padding:40px 0"><p>No MCP trend data</p></div>';
    }
    return;
  }

  const datasets = Object.entries(trends.mcpServerSeries).map(([server, values], i) => ({
    label: isHidden('hiddenMcpServers', server) ? redact('hiddenMcpServers', server) : (MCP_SERVER_LABELS[server] || server),
    data: values as number[],
    borderColor: COLORS[i % COLORS.length],
    backgroundColor: 'transparent',
    borderWidth: 2,
    tension: 0.3,
    pointRadius: 0,
    pointHitRadius: 8,
  }));

  const ctx = (document.getElementById('chart-mcp-trend') as HTMLCanvasElement).getContext('2d')!;
  trackChart(new Chart(ctx, {
    type: 'line',
    data: { labels: trends.labels, datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      scales: {
        x: { ticks: { maxRotation: 45, font: { size: 10 } } },
        y: { beginAtZero: true, title: { display: true, text: 'Calls / week' } },
      },
      plugins: {
        legend: { position: 'top', labels: { boxWidth: 12, font: { size: 10 } } },
      },
    },
  }));
}

function renderMcpDetail(data: any, container: HTMLElement): void {
  const el = container.querySelector('#mcp-detail') as HTMLElement;
  const servers = data.mcpServers || [];

  if (servers.length === 0) {
    el.innerHTML = '<div class="breakdown-summary"><span>No MCP servers used yet</span></div>';
    return;
  }

  const totalCalls = servers.reduce((s: number, srv: any) => s + srv.calls, 0);

  el.innerHTML = servers.map((srv: any, i: number) => {
    const pct = totalCalls > 0 ? Math.round(srv.calls / totalCalls * 100) : 0;
    const hidden = isHidden('hiddenMcpServers', srv.name);
    const label = hidden ? redact('hiddenMcpServers', srv.name) : (MCP_SERVER_LABELS[srv.name] || srv.name);
    const topTools = hidden
      ? srv.tools.slice(0, 3).map((_: any, j: number) => `tool_${j + 1}`).join(', ')
      : srv.tools.slice(0, 3).map((t: any) => t.name).join(', ');
    return `
      <div class="breakdown-item">
        <div class="breakdown-header">
          <span class="breakdown-dot" style="background:${COLORS[i % COLORS.length]}"></span>
          <span class="breakdown-label">${label}</span>
          <span class="breakdown-value">${fmtNum(srv.calls)} calls</span>
        </div>
        <div class="breakdown-bar-track">
          <div class="breakdown-bar-fill" style="width:${pct}%;background:${COLORS[i % COLORS.length]}"></div>
        </div>
        <div class="breakdown-sub" style="font-size:11px;color:#8b949e;margin-top:2px">${srv.tools.length} tools: ${topTools}</div>
      </div>
    `;
  }).join('') + `
    <div class="breakdown-summary">
      <span>${fmtNum(totalCalls)} total MCP calls across ${servers.length} servers</span>
    </div>
  `;
}

function renderSkillsDetail(data: any, container: HTMLElement): void {
  const el = container.querySelector('#skills-detail') as HTMLElement;
  const skills = data.skills || [];

  if (skills.length === 0) {
    el.innerHTML = '<div class="breakdown-summary"><span>No skills detected</span></div>';
    return;
  }

  const maxVal = skills[0]?.count || 1;

  // Group into categories
  const azureSkills = skills.filter((s: any) => s.name.startsWith('azure-') || s.name.startsWith('entra-'));
  const customSkills = skills.filter((s: any) => !s.name.startsWith('azure-') && !s.name.startsWith('entra-'));

  const renderGroup = (items: any[], title: string) => {
    if (items.length === 0) return '';
    return `<div class="breakdown-sub-title">${title}</div>` +
      items.slice(0, 10).map((sk: any, i: number) => {
        const pct = Math.round(sk.count / maxVal * 100);
        const hidden = isHidden('hiddenSkills', sk.name);
        const displayName = hidden
          ? redact('hiddenSkills', sk.name)
          : sk.name.replace('agent-workflow-builder_', '').replace('agent-', '').replace('azure-', '').replace('entra-', '');
        const titleAttr = hidden ? redact('hiddenSkills', sk.name) : sk.name;
        return `
          <div class="breakdown-item">
            <div class="breakdown-header">
              <span class="breakdown-dot" style="background:${COLORS[(i + 2) % COLORS.length]}"></span>
              <span class="breakdown-label" title="${titleAttr}">${displayName}</span>
              <span class="breakdown-value">${fmtNum(sk.count)}</span>
            </div>
            <div class="breakdown-bar-track">
              <div class="breakdown-bar-fill" style="width:${pct}%;background:${COLORS[(i + 2) % COLORS.length]}"></div>
            </div>
          </div>
        `;
      }).join('');
  };

  el.innerHTML = renderGroup(customSkills, 'Custom & Extension Skills') +
    renderGroup(azureSkills, 'Azure Skills') +
    `<div class="breakdown-summary">
      <span>${skills.length} skills available, ${skills.filter((s: any) => s.count > 0).length} actively used</span>
    </div>`;
}

function renderCustomizationDetail(data: any, container: HTMLElement): void {
  const c = data.customization;
  const el = container.querySelector('#customization-detail') as HTMLElement;

  const files = c.instructionFiles || [];
  const fileRows = files.slice(0, 10).map((f: any) => `
    <div class="breakdown-item">
      <div class="breakdown-header">
        <span class="breakdown-dot" style="background:#bc8cff"></span>
        <span class="breakdown-label" title="${f.name}">${f.name}</span>
        <span class="breakdown-value">${fmtNum(f.count)} uses</span>
      </div>
    </div>
  `).join('');

  el.innerHTML = `
    <div class="breakdown-item">
      <div class="breakdown-header">
        <span class="breakdown-dot" style="background:#58a6ff"></span>
        <span class="breakdown-label">Custom Instructions Attached</span>
        <span class="breakdown-value">${fmtNum(c.totalInstructionRefs)}</span>
      </div>
    </div>
    <div class="breakdown-item">
      <div class="breakdown-header">
        <span class="breakdown-dot" style="background:#3fb950"></span>
        <span class="breakdown-label">Prompt File References (.prompt.md)</span>
        <span class="breakdown-value">${fmtNum(c.promptFileUsage)}</span>
      </div>
    </div>
    <div class="breakdown-item">
      <div class="breakdown-header">
        <span class="breakdown-dot" style="background:#d29922"></span>
        <span class="breakdown-label">Inline Prompt Text</span>
        <span class="breakdown-value">${fmtNum(c.promptTextUsage)}</span>
      </div>
    </div>
    ${files.length > 0 ? '<div class="breakdown-sub-title">Instruction Files</div>' : ''}
    ${fileRows}
  `;
}

function renderToolsChart(data: any): void {
  const tools = data.toolCalls.slice(0, 12);
  const ctx = (document.getElementById('chart-tools') as HTMLCanvasElement).getContext('2d')!;

  // Shorten tool names for display
  const shortName = (name: string) => {
    return name
      .replace('multi_replace_string_in_file', 'multi_replace')
      .replace('replace_string_in_file', 'replace_string')
      .replace('run_in_terminal', 'terminal')
      .replace('manage_todo_list', 'todo_list')
      .replace('copilot_getNotebookSummary', 'notebook_summary')
      .replace('semantic_search', 'sem_search')
      .replace(/^mcp_[^_]+_/, 'mcp:');
  };

  trackChart(new Chart(ctx, {
    type: 'bar',
    data: {
      labels: tools.map((t: any) => shortName(t.name)),
      datasets: [{
        data: tools.map((t: any) => t.count),
        backgroundColor: tools.map((_: any, i: number) => COLORS[i % COLORS.length]),
        borderWidth: 0,
        borderRadius: 4,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      indexAxis: 'y',
      scales: {
        x: { beginAtZero: true },
        y: { ticks: { font: { size: 10 } } },
      },
      plugins: { legend: { display: false } },
    },
  }));
}

function renderToolsTrend(data: any): void {
  const trends = data.weeklyTrends;
  if (!trends.labels.length) return;

  const shortName = (name: string) => {
    return name
      .replace('replace_string_in_file', 'replace')
      .replace('run_in_terminal', 'terminal')
      .replace('manage_todo_list', 'todos')
      .replace(/^mcp_[^_]+_/, 'mcp:');
  };

  const datasets = Object.entries(trends.toolCallSeries).map(([tool, values], i) => ({
    label: shortName(tool),
    data: values as number[],
    borderColor: COLORS[i % COLORS.length],
    backgroundColor: 'transparent',
    borderWidth: 2,
    tension: 0.3,
    pointRadius: 0,
    pointHitRadius: 8,
  }));

  const ctx = (document.getElementById('chart-tools-trend') as HTMLCanvasElement).getContext('2d')!;
  trackChart(new Chart(ctx, {
    type: 'line',
    data: { labels: trends.labels, datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      scales: {
        x: { ticks: { maxRotation: 45, font: { size: 10 } } },
        y: { beginAtZero: true, title: { display: true, text: 'Calls / week' } },
      },
      plugins: {
        legend: { position: 'top', labels: { boxWidth: 12, font: { size: 10 } } },
      },
    },
  }));
}

function renderModelModeTable(data: any, container: HTMLElement): void {
  const modeData = data.modelByMode || [];
  if (modeData.length === 0) return;

  const el = container.querySelector('#model-mode-table') as HTMLElement;
  const MODEL_COLORS: Record<string, string> = {
    'claude-opus-4.5': '#bc8cff',
    'claude-opus-4.6': '#d2a8ff',
    'claude-opus-4.6-fast': '#a371f7',
    'claude-sonnet-4': '#58a6ff',
    'claude-sonnet-4.5': '#79c0ff',
    'claude-3.7-sonnet': '#56d4dd',
    'claude-3.5-sonnet': '#39d2c0',
    'gpt-5': '#3fb950',
    'gpt-4o': '#7ee787',
    'gemini-3-pro': '#f778ba',
    'gemini-2.5-pro': '#f47067',
    'unknown': '#484f58',
  };

  let html = '<table class="data-table"><thead><tr><th style="width:140px">Mode</th><th>Model Distribution</th><th style="width:70px;text-align:right">Total</th></tr></thead><tbody>';

  for (const entry of modeData.slice(0, 10)) {
    const totalForMode = entry.models.reduce((s: number, m: any) => s + m.count, 0);
    if (totalForMode === 0) continue;

    // Render stacked bar
    const bars = entry.models.map((m: any) => {
      const pct = (m.count / totalForMode * 100);
      const color = MODEL_COLORS[m.model] || COLORS[entry.models.indexOf(m) % COLORS.length];
      if (pct < 2) return '';
      return `<div class="model-bar-seg" style="width:${pct}%;background:${color}" title="${m.model}: ${fmtNum(m.count)} (${Math.round(pct)}%)"></div>`;
    }).join('');

    const legend = entry.models.slice(0, 4).map((m: any) => {
      const pct = Math.round(m.count / totalForMode * 100);
      const color = MODEL_COLORS[m.model] || COLORS[entry.models.indexOf(m) % COLORS.length];
      return `<span class="model-legend-item"><span class="breakdown-dot" style="background:${color};width:8px;height:8px"></span>${m.model} ${pct}%</span>`;
    }).join('');

    html += `<tr>
      <td><strong>${redact('hiddenAgentModes', entry.mode)}</strong></td>
      <td>
        <div class="model-bar-track">${bars}</div>
        <div class="model-legend">${legend}</div>
      </td>
      <td style="text-align:right">${fmtNum(totalForMode)}</td>
    </tr>`;
  }

  html += '</tbody></table>';
  el.innerHTML = html;
}
