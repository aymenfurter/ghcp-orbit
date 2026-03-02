/* Dashboard page */
import { Chart } from 'chart.js';
import { trackChart, destroyCharts, COLORS, fmtNum, getWorkspaceFilter } from '../app';

export async function renderDashboard(container: HTMLElement): Promise<void> {
  const f = getWorkspaceFilter();
  const [activity, workspaces, hourly, agentSaved] = await Promise.all([
    window.orbit.getDailyActivity(f),
    window.orbit.getWorkspaceBreakdown(f),
    window.orbit.getHourlyDistribution(f),
    window.orbit.loadAgentResults(),
  ]);

  if (!activity || !activity.labels.length) {
    container.innerHTML = '<div class="empty-state"><h3>No data found</h3><p>Make sure your Copilot Chat logs are accessible.</p></div>';
    return;
  }

  const totalMessages = activity.values.reduce((a: number, b: number) => a + b, 0);
  const totalLoc = activity.loc.reduce((a: number, b: number) => a + b, 0);
  const daysActive = activity.labels.length;
  const avgPerDay = daysActive > 0 ? Math.round(totalMessages / daysActive) : 0;

  // Agentic insights KPIs
  const hasAgent = agentSaved && agentSaved.checks && agentSaved.checks.length > 0;
  const aiScore = hasAgent ? Math.round(agentSaved.checks.reduce((a: number, r: any) => a + r.score, 0) / agentSaved.checks.length) : null;

  container.innerHTML = `
    <div class="page-header">
      <h1>Dashboard</h1>
      <p>Overview of your Copilot usage across ${daysActive} active days</p>
    </div>

    <div class="stats-row">
      <div class="stat-card">
        <div class="stat-label">Total Messages</div>
        <div class="stat-value blue">${fmtNum(totalMessages)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Lines of Code</div>
        <div class="stat-value green">${fmtNum(totalLoc)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Active Days</div>
        <div class="stat-value">${daysActive}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Avg / Day</div>
        <div class="stat-value purple">${avgPerDay}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Workspaces</div>
        <div class="stat-value cyan">${workspaces?.labels?.length || 0}</div>
      </div>
      <div class="stat-card" id="card-ai-score" style="cursor:pointer" title="${hasAgent ? 'View Agentic Insights' : 'Run AI Analysis'}">
        <div class="stat-label">AI Score</div>
        <div class="stat-value ${aiScore !== null ? (aiScore >= 70 ? 'green' : aiScore >= 40 ? 'orange' : 'red') : 'text-muted'}">${aiScore !== null ? aiScore : '—'}</div>
        <div class="stat-sub" style="font-size:9px">${hasAgent ? 'Copilot SDK' : '<span style="text-decoration:underline">Run</span>'}</div>
      </div>
    </div>

    <div class="card">
      <div class="card-title">Daily Activity</div>
      <div class="chart-wrap tall"><canvas id="chart-daily"></canvas></div>
    </div>

    <div class="grid-2">
      <div class="card">
        <div class="card-title">Top Workspaces</div>
        <div class="chart-wrap"><canvas id="chart-workspaces"></canvas></div>
      </div>
      <div class="card">
        <div class="card-title">Hourly Distribution</div>
        <div class="chart-wrap"><canvas id="chart-hourly"></canvas></div>
      </div>
    </div>
  `;

  // Daily activity chart (messages + LoC)
  trackChart(new Chart(document.getElementById('chart-daily') as HTMLCanvasElement, {
    type: 'bar',
    data: {
      labels: activity.labels,
      datasets: [
        {
          label: 'Messages',
          data: activity.values,
          backgroundColor: 'rgba(88,166,255,0.6)',
          borderColor: '#58a6ff',
          borderWidth: 1,
          yAxisID: 'y',
          order: 2,
        },
        {
          label: 'Lines of Code',
          data: activity.loc,
          type: 'line',
          borderColor: '#3fb950',
          backgroundColor: 'rgba(63,185,80,0.1)',
          fill: true,
          tension: 0.3,
          pointRadius: 0,
          borderWidth: 2,
          yAxisID: 'y1',
          order: 1,
        },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      scales: {
        x: { ticks: { maxTicksLimit: 20 }, grid: { display: false } },
        y: { position: 'left', title: { display: true, text: 'Messages' }, beginAtZero: true },
        y1: { position: 'right', title: { display: true, text: 'LoC' }, beginAtZero: true, grid: { drawOnChartArea: false } },
      },
      plugins: { legend: { position: 'top' } },
    },
  }));

  // Workspace breakdown (horizontal bar)
  if (workspaces && workspaces.labels.length) {
    const top = Math.min(15, workspaces.labels.length);
    trackChart(new Chart(document.getElementById('chart-workspaces') as HTMLCanvasElement, {
      type: 'bar',
      data: {
        labels: workspaces.labels.slice(0, top),
        datasets: [{
          data: workspaces.values.slice(0, top),
          backgroundColor: COLORS.slice(0, top),
        }],
      },
      options: {
        indexAxis: 'y',
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { x: { beginAtZero: true }, y: { ticks: { callback: (_, i) => {
          const lbl = workspaces.labels[i];
          return lbl && lbl.length > 20 ? lbl.slice(0, 19) + '\u2026' : lbl;
        }}}},
      },
    }));
  }

  // Hourly distribution
  if (hourly) {
    trackChart(new Chart(document.getElementById('chart-hourly') as HTMLCanvasElement, {
      type: 'bar',
      data: {
        labels: Array.from({ length: 24 }, (_, i) => `${i}:00`),
        datasets: [{
          data: hourly.hours,
          backgroundColor: hourly.hours.map((_: number, i: number) =>
            i >= 9 && i <= 17 ? 'rgba(88,166,255,0.6)' : 'rgba(88,166,255,0.25)'
          ),
          borderRadius: 2,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true }, x: { grid: { display: false } } },
      },
    }));
  }

  // AI Score / Needs Work card click handlers
  const aiCardHandler = () => {
    const hasResults = agentSaved && agentSaved.checks && agentSaved.checks.length > 0;
    const navItem = document.querySelector('.nav-item[data-page="agentic"]') as HTMLElement | null;
    if (navItem) navItem.click();
    if (!hasResults) {
      setTimeout(() => {
        const runBtn = document.getElementById('btn-run-ai');
        if (runBtn) runBtn.click();
      }, 300);
    }
  };
  document.getElementById('card-ai-score')?.addEventListener('click', aiCardHandler);
}
