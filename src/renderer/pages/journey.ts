/* Project Journey page */
import { Chart } from 'chart.js';
import { trackChart, COLORS, fmtNum, fmtDate, getGlobalWorkspace } from '../app';

const WORK_TYPE_COLORS: Record<string, string> = {
  'feature': '#58a6ff', 'bug fix': '#f85149', 'refactor': '#d29922',
  'code review': '#da7756', 'docs': '#3fb950', 'test': '#bc8cff', 'style': '#f778ba',
  'config': '#79c0ff', 'other': '#8b949e',
};

export async function renderJourney(container: HTMLElement): Promise<void> {
  container.innerHTML = `
    <div class="page-header">
      <h1>Project Journey</h1>
      <p>Chronological development story${getGlobalWorkspace() ? ' of ' + getGlobalWorkspace() : ''}</p>
    </div>
    <div id="journey-content">
      <div class="loading-inline"><div class="loading-spinner"></div>Loading...</div>
    </div>
  `;

  await loadJourney();
}

async function loadJourney() {
  const el = document.getElementById('journey-content');
  if (!el) return;
  el.innerHTML = '<div class="loading-inline"><div class="loading-spinner"></div>Loading...</div>';

  const workspace = getGlobalWorkspace();
  const data = await window.orbit.getJourney(workspace || undefined);
  if (!data || !data.events || data.events.length === 0) {
    el.innerHTML = '<div class="empty-state"><h3>No journey data</h3><p>Select a workspace with activity</p></div>';
    return;
  }

  const summary = data.summary || {};
  const dateRange = data.dateRange || {};

  el.innerHTML = `
    <div class="stats-row">
      <div class="stat-card">
        <div class="stat-label">Total Requests</div>
        <div class="stat-value blue">${fmtNum(data.totalRequests)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Sessions</div>
        <div class="stat-value">${fmtNum(data.totalSessions)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Lines of Code</div>
        <div class="stat-value green">${fmtNum(data.totalLoC)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Files</div>
        <div class="stat-value purple">${fmtNum(summary.fileCount || 0)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Date Range</div>
        <div class="stat-value text-sm">${dateRange.from || '?'} — ${dateRange.to || '?'}</div>
      </div>
    </div>

    <div class="tabs" id="journey-tabs">
      <button class="tab active" data-tab="timelines">Timelines</button>
      <button class="tab" data-tab="activity">Agent Activity Overview</button>
      <button class="tab" data-tab="events">Event Log</button>
    </div>

    <div id="journey-tab-timelines">
      <div class="card">
        <div class="card-title">Work Types Over Time</div>
        <div class="chart-wrap" style="height:378px"><canvas id="chart-work-types-tl"></canvas></div>
      </div>
      <div class="grid-2">
        <div class="card">
          <div class="card-title">Technology Timeline</div>
          <div class="chart-wrap"><canvas id="chart-tech-tl"></canvas></div>
        </div>
        <div class="card">
          <div class="card-title">Models Timeline</div>
          <div class="chart-wrap"><canvas id="chart-models-tl"></canvas></div>
        </div>
      </div>
    </div>

    <div id="journey-tab-activity" style="display:none">
      <div class="card">
        <div class="card-title">Session Concurrency</div>
        <p class="text-sm text-muted mb-8">How many sessions you work on in parallel over time</p>
        <div class="chart-wrap"><canvas id="chart-concurrency-tl"></canvas></div>
      </div>
      <div class="card">
        <div class="card-title">Agent Activity Overview</div>
        <div class="grid-3">
          <div>
            <div class="text-xs text-subtle mb-8">TOP MODELS</div>
            ${(summary.topModels || []).slice(0, 5).map((e: [string, number]) =>
              `<div class="flex-between" style="padding:3px 0"><span class="text-sm">${e[0]}</span><span class="badge">${fmtNum(e[1])}</span></div>`
            ).join('')}
          </div>
          <div>
            <div class="text-xs text-subtle mb-8">TOP TOOLS</div>
            ${(summary.topTools || []).slice(0, 5).map((e: [string, number]) =>
              `<div class="flex-between" style="padding:3px 0"><span class="text-sm">${e[0]}</span><span class="badge">${fmtNum(e[1])}</span></div>`
            ).join('')}
          </div>
          <div>
            <div class="text-xs text-subtle mb-8">WORK TYPES</div>
            ${(summary.workTypes || []).slice(0, 5).map((e: [string, number]) =>
              `<div class="flex-between" style="padding:3px 0"><span class="text-sm">${e[0]}</span><span class="badge">${fmtNum(e[1])}</span></div>`
            ).join('')}
          </div>
        </div>
      </div>
    </div>

    <div id="journey-tab-events" style="display:none;overflow-y:auto;max-height:calc(100vh - 280px)">
      <div class="card">
        <div class="card-title">Event Log (last 100)</div>
        <div id="event-log"></div>
      </div>
    </div>
  `;

  // Tab switching
  const tabPanels = ['timelines', 'activity', 'events'];
  const renderedTabs = new Set<string>(['timelines']);

  function showTab(tab: string) {
    for (const t of tabPanels) {
      const panel = document.getElementById(`journey-tab-${t}`);
      if (panel) panel.style.display = t === tab ? '' : 'none';
    }
    el!.querySelectorAll('#journey-tabs .tab').forEach(b => {
      b.classList.toggle('active', b.getAttribute('data-tab') === tab);
    });
    if (!renderedTabs.has(tab)) {
      renderedTabs.add(tab);
      if (tab === 'activity') renderActivityTab(data);
      if (tab === 'events') renderEventLog(data);
    }
  }

  el.querySelectorAll('#journey-tabs .tab').forEach(btn => {
    btn.addEventListener('click', () => showTab(btn.getAttribute('data-tab') || 'timelines'));
  });

  // Work types stacked bar
  if (data.workTypesTimeline && data.workTypesTimeline.labels.length) {
    const wt = data.workTypesTimeline;
    const types = Object.keys(wt.datasets);
    trackChart(new Chart(document.getElementById('chart-work-types-tl') as HTMLCanvasElement, {
      type: 'bar',
      data: {
        labels: wt.labels,
        datasets: types.map((t, i) => ({
          label: t,
          data: wt.datasets[t],
          backgroundColor: WORK_TYPE_COLORS[t] || COLORS[i % COLORS.length],
        })),
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        scales: { x: { stacked: true, ticks: { maxTicksLimit: 20 }, grid: { display: false } }, y: { stacked: true, beginAtZero: true } },
        plugins: { legend: { position: 'bottom' } },
      },
    }));
  }

  // Tech timeline stacked area
  if (data.techTimeline && data.techTimeline.labels.length) {
    const tt = data.techTimeline;
    const techs = Object.keys(tt.datasets);
    trackChart(new Chart(document.getElementById('chart-tech-tl') as HTMLCanvasElement, {
      type: 'bar',
      data: {
        labels: tt.labels,
        datasets: techs.map((t, i) => ({
          label: t,
          data: tt.datasets[t],
          backgroundColor: COLORS[i % COLORS.length] + '99',
        })),
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        scales: { x: { stacked: true, ticks: { maxTicksLimit: 15 }, grid: { display: false } }, y: { stacked: true, beginAtZero: true } },
        plugins: { legend: { position: 'bottom' } },
      },
    }));
  }

  // Models timeline stacked bar
  if (data.modelsTimeline && data.modelsTimeline.labels.length) {
    const mt = data.modelsTimeline;
    const models = Object.keys(mt.datasets);
    trackChart(new Chart(document.getElementById('chart-models-tl') as HTMLCanvasElement, {
      type: 'bar',
      data: {
        labels: mt.labels,
        datasets: models.map((m, i) => ({
          label: m,
          data: mt.datasets[m],
          backgroundColor: COLORS[i % COLORS.length] + '99',
        })),
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        scales: { x: { stacked: true, ticks: { maxTicksLimit: 15 }, grid: { display: false } }, y: { stacked: true, beginAtZero: true } },
        plugins: { legend: { position: 'bottom' } },
      },
    }));
  }
}

function renderActivityTab(data: any) {
  // Session concurrency chart
  if (data.concurrencyTimeline && data.concurrencyTimeline.labels.length) {
    const ct = data.concurrencyTimeline;
    trackChart(new Chart(document.getElementById('chart-concurrency-tl') as HTMLCanvasElement, {
      type: 'line',
      data: {
        labels: ct.labels,
        datasets: [
          {
            label: 'Concurrent Sessions',
            data: ct.maxConcurrent,
            borderColor: '#bc8cff',
            backgroundColor: 'rgba(188,140,255,0.1)',
            fill: true,
            tension: 0.3,
            pointRadius: 2,
            borderWidth: 2,
          },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        scales: {
          x: { ticks: { maxTicksLimit: 20 }, grid: { display: false } },
          y: { beginAtZero: true, title: { display: true, text: 'Sessions' }, ticks: { stepSize: 1 } },
        },
        plugins: { legend: { position: 'bottom' } },
      },
    }));
  }
}

function renderEventLog(data: any) {
  const evLog = document.getElementById('event-log');
  if (evLog && data.events.length) {
    const recent = data.events.slice(-100).reverse();
    let html = '<ul class="event-list">';
    for (const ev of recent) {
      const langs = ev.languages?.length ? ev.languages.join(', ') : '';
      const filesCount = (ev.filesEdited?.length || 0) + (ev.filesReferenced?.length || 0);
      html += `
        <li class="event-item" data-type="${ev.workType === 'bug fix' ? 'debug' : ev.workType === 'feature' ? 'code' : ev.workType === 'docs' ? 'question' : ev.workType === 'refactor' ? 'architecture' : 'exploration'}">
          <div class="event-time">${ev.day} ${ev.time}</div>
          <div class="event-title">${escapeHtml(ev.preview)}</div>
          <div class="event-meta">
            <span class="badge">${ev.workType}</span>
            ${ev.model ? `<span>${ev.model}</span>` : ''}
            ${ev.loc ? `<span>${ev.loc} LoC</span>` : ''}
            ${langs ? `<span>${langs}</span>` : ''}
            ${filesCount ? `<span>${filesCount} files</span>` : ''}
          </div>
        </li>
      `;
    }
    html += '</ul>';
    evLog.innerHTML = html;
  }
}

function escapeHtml(str: string): string {
  const el = document.createElement('span');
  el.textContent = str;
  return el.innerHTML;
}
