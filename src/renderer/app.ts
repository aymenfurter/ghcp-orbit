/* Orbit – Renderer entry point */

import { Chart, registerables } from 'chart.js';
import { renderDashboard } from './pages/dashboard';
import { renderPatterns } from './pages/patterns';
import { renderProduction } from './pages/production';
import { renderConsumption } from './pages/consumption';
import { renderBurndown } from './pages/burndown';
import { renderTimeline } from './pages/timeline';
import { renderJourney } from './pages/journey';
import { renderSessions } from './pages/sessions';
import { renderBehavior, renderAgentic } from './pages/recommendations';
import { renderTooling } from './pages/tooling';
import { renderSettings } from './pages/settings';
import { loadRedactSettings, resetRedactCounters, redact } from './redact';
import { injectZoomButtons, teardownZoom } from './zoom';

Chart.register(...registerables);

// ---- Chart defaults (dark theme) ----
Chart.defaults.color = '#8b949e';
Chart.defaults.borderColor = '#21262d';
Chart.defaults.font.family = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif";
Chart.defaults.font.size = 11;
Chart.defaults.plugins.legend!.labels!.boxWidth = 12;
Chart.defaults.plugins.legend!.labels!.padding = 12;

// ---- Types from preload ----
declare global {
  interface Window {
    orbit: {
      getDailyActivity: (f?: any) => Promise<any>;
      getHourlyDistribution: (f?: any) => Promise<any>;
      getHeatmap: (f?: any) => Promise<any>;
      getWorkspaceBreakdown: (f?: any) => Promise<any>;
      getCodeProduction: (f?: any) => Promise<any>;
      getConsumption: (f?: any) => Promise<any>;
      getDayTimeline: (date: string, mode?: string, ws?: string, end?: string) => Promise<any>;
      getJourney: (ws?: string) => Promise<any>;
      getSessions: (f?: any, page?: number, size?: number) => Promise<any>;
      getSessionDetail: (id: string) => Promise<any>;
      getWorkspaces: () => Promise<string[]>;
      getWorkspacesWithCost: () => Promise<{ name: string; cost: number; requests: number }[]>;
      getBurndown: (cfg: any) => Promise<any>;
      getRecommendations: (ws?: string) => Promise<any>;
      getAgentAnalysis: (ws?: string, model?: string) => Promise<any>;
      getTimelineActivity: (ws?: string) => Promise<any>;
      getTooling: (f?: any) => Promise<any>;
      reloadData: () => Promise<any>;
      selectLogsDir: () => Promise<any>;
      getLogsDirs: () => Promise<any>;
      onDataReady: (cb: (data: any) => void) => void;
      onParseProgress: (cb: (data: any) => void) => void;
      saveAgentResults: (data: any) => Promise<any>;
      loadAgentResults: () => Promise<any>;
      onAgentProgress: (cb: (event: any) => void) => void;
      getRedactSettings: () => Promise<any>;
      saveRedactSettings: (settings: any) => Promise<any>;
      getAvailableItems: () => Promise<any>;
    };
  }
}

// ---- Global workspace filter ----
let globalWorkspace = '';

export function getGlobalWorkspace(): string {
  return globalWorkspace;
}

export function getWorkspaceFilter(): { workspace?: string } {
  return globalWorkspace ? { workspace: globalWorkspace } : {};
}

// ---- Chart lifecycle management ----
const activeCharts: Chart[] = [];

export function trackChart(chart: Chart): Chart {
  activeCharts.push(chart);
  return chart;
}

export function destroyCharts(): void {
  while (activeCharts.length) {
    const c = activeCharts.pop();
    c?.destroy();
  }
}

// ---- Colors ----
export const COLORS = [
  '#58a6ff', '#3fb950', '#bc8cff', '#d29922', '#f85149',
  '#39d2c0', '#f778ba', '#79c0ff', '#7ee787', '#d2a8ff',
  '#e3b341', '#ffa198', '#56d4dd', '#ff9bce', '#a5d6ff',
];

// ---- Formatting utilities ----
export function fmtNum(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return String(Math.round(n));
}

export function fmtDate(ts: number | null): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function fmtTime(ts: number | null): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

export function fmtDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const min = Math.floor(ms / 60000);
  const sec = Math.round((ms % 60000) / 1000);
  return `${min}m ${sec}s`;
}

export function fmtPct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

export function shortLabel(label: string, max = 12): string {
  return label.length > max ? label.slice(0, max - 1) + '\u2026' : label;
}

// ---- Page router ----
type PageRenderer = (container: HTMLElement) => Promise<void>;

const pages: Record<string, PageRenderer> = {
  dashboard: renderDashboard,
  patterns: renderPatterns,
  production: renderProduction,
  consumption: renderConsumption,
  burndown: renderBurndown,
  timeline: renderTimeline,
  journey: renderJourney,
  sessions: renderSessions,
  behavior: renderBehavior,
  agentic: renderAgentic,
  tooling: renderTooling,
  settings: renderSettings,
};

let currentPage = '';

async function navigateTo(page: string) {
  if (page === currentPage) return;
  currentPage = page;

  // Update nav
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.getAttribute('data-page') === page);
  });

  // Clear previous content + charts
  teardownZoom();
  destroyCharts();
  resetRedactCounters();
  const content = document.getElementById('content')!;
  content.innerHTML = '<div class="loading-inline"><div class="loading-spinner"></div>Loading...</div>';
  content.scrollTop = 0;

  content.classList.remove('no-scroll');

  // Render page
  const render = pages[page];
  if (render) {
    try {
      await render(content);
      injectZoomButtons(content);
    } catch (err) {
      console.error(`Error rendering ${page}:`, err);
      content.innerHTML = `<div class="empty-state"><h3>Error loading page</h3><p>${(err as Error).message}</p></div>`;
    }
  } else {
    content.innerHTML = '<div class="empty-state"><h3>Page not found</h3></div>';
  }
}

// ---- Init ----
function init() {
  // Nav click handlers
  document.querySelectorAll('.nav-item').forEach(el => {
    el.addEventListener('click', () => {
      const page = el.getAttribute('data-page');
      if (page) navigateTo(page);
    });
  });

  // Footer buttons
  document.getElementById('btn-reload')?.addEventListener('click', async () => {
    const content = document.getElementById('content')!;
    content.innerHTML = '<div class="loading-screen"><div class="loading-spinner"></div><p>Reloading data...</p></div>';
    currentPage = '';
    destroyCharts();
    await window.orbit.reloadData();
    await navigateTo('dashboard');
  });

  document.getElementById('btn-logs-dir')?.addEventListener('click', async () => {
    const result = await window.orbit.selectLogsDir();
    if (result) {
      const content = document.getElementById('content')!;
      content.innerHTML = '<div class="loading-screen"><div class="loading-spinner"></div><p>Loading new data...</p></div>';
      currentPage = '';
      destroyCharts();
      await navigateTo('dashboard');
    }
  });

  // Listen for parsing progress updates
  window.orbit.onParseProgress((data: any) => {
    const sub = document.getElementById('load-sub');
    if (sub) {
      const pct = data.total > 0 ? Math.round((data.done / data.total) * 100) : 0;
      sub.textContent = `Scanned ${data.done} / ${data.total} directories — ${data.sessions} sessions found`;
    }
    const fill = document.querySelector('.load-bar-fill') as HTMLElement;
    if (fill && data.total > 0) {
      const pct = Math.round((data.done / data.total) * 100);
      fill.style.animation = 'none';
      fill.style.width = `${pct}%`;
      fill.style.transition = 'width 0.2s ease';
    }
  });

  // Wait for data to be parsed
  window.orbit.onDataReady(async (data: any) => {
    console.log(`Orbit: loaded ${data.sessions} sessions from ${data.dirs?.length || 0} directories`);
    // Load redact settings before rendering any page
    await loadRedactSettings();
    // Hide loading overlay with fade
    const overlay = document.getElementById('load-overlay');
    if (overlay) overlay.classList.add('hidden');
    // Populate workspace sidebar
    await populateWorkspaceSidebar();
    navigateTo('dashboard');
  });
}

async function populateWorkspaceSidebar() {
  const wsList = document.getElementById('ws-list');
  const wsSearch = document.getElementById('ws-search') as HTMLInputElement | null;
  if (!wsList) return;
  try {
    const workspaces = await window.orbit.getWorkspacesWithCost();

    function renderItems(filter: string) {
      const q = filter.toLowerCase();
      let html = `<div class="ws-item${globalWorkspace === '' ? ' active' : ''}" data-ws=""><span class="ws-name">All Workspaces</span></div>`;
      for (const ws of workspaces) {
        if (q && !ws.name.toLowerCase().includes(q)) continue;
        const costLabel = ws.cost >= 1 ? `$${ws.cost.toFixed(0)}` : `$${ws.cost.toFixed(2)}`;
        const displayName = redact('hiddenWorkspaces', ws.name);
        const truncName = displayName.length > 20 ? displayName.slice(0, 19) + '\u2026' : displayName;
        html += `<div class="ws-item${ws.name === globalWorkspace ? ' active' : ''}" data-ws="${escHtml(ws.name)}" title="${escHtml(displayName)} - ${ws.requests} requests"><span class="ws-name">${escHtml(truncName)}</span><span class="ws-cost">${costLabel}</span></div>`;
      }
      wsList.innerHTML = html;
      wsList.querySelectorAll('.ws-item').forEach(el => {
        el.addEventListener('click', () => {
          const ws = el.getAttribute('data-ws') || '';
          if (ws === globalWorkspace) return;
          globalWorkspace = ws;
          wsList.querySelectorAll('.ws-item').forEach(e => e.classList.toggle('active', (e.getAttribute('data-ws') || '') === ws));
          const prev = currentPage;
          currentPage = '';
          navigateTo(prev);
        });
      });
    }

    renderItems('');

    if (wsSearch) {
      wsSearch.addEventListener('input', () => renderItems(wsSearch.value));
    }
  } catch { /* workspace population failed silently */ }
}

function escHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

document.addEventListener('DOMContentLoaded', init);
