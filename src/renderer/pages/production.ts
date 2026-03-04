/* Code Production page */
import { Chart } from 'chart.js';
import { trackChart, fmtNum, fmtPct, getWorkspaceFilter } from '../app';

export async function renderProduction(container: HTMLElement): Promise<void> {
  const data = await window.orbit.getCodeProduction(getWorkspaceFilter());
  if (!data || !data.summary) {
    container.innerHTML = '<div class="empty-state"><h3>No code production data</h3></div>';
    return;
  }

  const s = data.summary;

  container.innerHTML = `
    <div class="page-header">
      <h1>Code Production</h1>
      <p>AI-generated vs user-written code analysis</p>
    </div>

    <div class="stats-row">
      <div class="stat-card">
        <div class="stat-label">Total LoC</div>
        <div class="stat-value">${fmtNum(s.totalLoc)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">AI Generated</div>
        <div class="stat-value green">${fmtNum(s.totalAiLoc)}</div>
        <div class="stat-sub">${fmtPct(s.aiRatio)} of total</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">User Written</div>
        <div class="stat-value blue">${fmtNum(s.totalUserLoc)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">AI Blocks</div>
        <div class="stat-value purple">${fmtNum(s.aiBlocks)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Est. Value (2010 $/LoC)</div>
        <div class="stat-value orange">$${fmtNum(s.locCost2010)}</div>
      </div>
    </div>

    <div class="card">
      <div class="card-title">Daily Code Production</div>
      <div class="chart-wrap" style="height:414px"><canvas id="chart-daily-prod"></canvas></div>
    </div>

    <div class="grid-2">
      <div class="card">
        <div class="card-title">By Language</div>
        <div class="chart-wrap" style="height:324px"><canvas id="chart-lang"></canvas></div>
      </div>
      <div class="card">
        <div class="card-title">By Workspace</div>
        <div class="chart-wrap" style="height:324px"><canvas id="chart-ws-prod"></canvas></div>
      </div>
    </div>
  `;

  // Daily timeline
  if (data.dailyTimeline && data.dailyTimeline.labels.length) {
    const aiLoc: number[] = data.dailyTimeline.aiLoc;
    const userLoc: number[] = data.dailyTimeline.userLoc;
    const totals = aiLoc.map((v: number, i: number) => v + userLoc[i]);

    // Moving average trendline (window adapts to data size)
    const n = totals.length;
    const window = Math.max(3, Math.min(7, Math.round(n / 8)));
    const trendData = totals.map((_: number, i: number) => {
      const start = Math.max(0, i - Math.floor(window / 2));
      const end = Math.min(n, i + Math.ceil(window / 2) + 1);
      let sum = 0;
      for (let j = start; j < end; j++) sum += totals[j];
      return Math.round(sum / (end - start));
    });

    trackChart(new Chart(document.getElementById('chart-daily-prod') as HTMLCanvasElement, {
      type: 'bar',
      data: {
        labels: data.dailyTimeline.labels,
        datasets: [
          { label: 'AI LoC', data: aiLoc, backgroundColor: 'rgba(63,185,80,0.6)' },
          { label: 'User LoC', data: userLoc, backgroundColor: 'rgba(88,166,255,0.6)' },
          {
            label: 'Trend (Total LoC)',
            data: trendData,
            type: 'line',
            borderColor: 'rgba(255,180,50,0.9)',
            borderWidth: 2,
            borderDash: [6, 3],
            pointRadius: 0,
            fill: false,
            stack: undefined as unknown as string,
          },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        scales: {
          x: { stacked: true, ticks: { maxTicksLimit: 20 }, grid: { display: false } },
          y: { stacked: true, beginAtZero: true },
        },
        plugins: { legend: { position: 'top' } },
      },
    }));
  }

  // By language (horizontal bar)
  if (data.byLanguage && data.byLanguage.labels.length) {
    const top = Math.min(13, data.byLanguage.labels.length);
    trackChart(new Chart(document.getElementById('chart-lang') as HTMLCanvasElement, {
      type: 'bar',
      data: {
        labels: data.byLanguage.labels.slice(0, top),
        datasets: [
          { label: 'AI', data: data.byLanguage.aiLoc.slice(0, top), backgroundColor: 'rgba(63,185,80,0.6)' },
          { label: 'User', data: data.byLanguage.userLoc.slice(0, top), backgroundColor: 'rgba(88,166,255,0.6)' },
        ],
      },
      options: {
        indexAxis: 'y',
        responsive: true, maintainAspectRatio: false,
        scales: { x: { stacked: true, beginAtZero: true }, y: { stacked: true } },
        plugins: { legend: { position: 'top' } },
      },
    }));
  }

  // By workspace
  if (data.byWorkspace && data.byWorkspace.labels.length) {
    const top = Math.min(11, data.byWorkspace.labels.length);
    trackChart(new Chart(document.getElementById('chart-ws-prod') as HTMLCanvasElement, {
      type: 'bar',
      data: {
        labels: data.byWorkspace.labels.slice(0, top),
        datasets: [
          { label: 'AI', data: data.byWorkspace.aiLoc.slice(0, top), backgroundColor: 'rgba(63,185,80,0.6)' },
          { label: 'User', data: data.byWorkspace.userLoc.slice(0, top), backgroundColor: 'rgba(88,166,255,0.6)' },
        ],
      },
      options: {
        indexAxis: 'y',
        responsive: true, maintainAspectRatio: false,
        scales: { x: { stacked: true, beginAtZero: true }, y: { stacked: true } },
        plugins: { legend: { position: 'top' } },
      },
    }));
  }
}
