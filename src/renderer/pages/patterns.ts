/* Work Patterns page – heatmap + hourly breakdown by work type */
import { Chart } from 'chart.js';
import { trackChart, COLORS, fmtNum, getWorkspaceFilter } from '../app';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const WORK_TYPE_COLORS: Record<string, string> = {
  'feature': '#58a6ff', 'bug fix': '#f85149', 'refactor': '#d29922',
  'code review': '#da7756', 'docs': '#3fb950', 'test': '#bc8cff', 'style': '#f778ba',
  'config': '#79c0ff', 'other': '#8b949e',
};

export async function renderPatterns(container: HTMLElement): Promise<void> {
  const f = getWorkspaceFilter();
  const [heatmap, hourly] = await Promise.all([
    window.orbit.getHeatmap(f),
    window.orbit.getHourlyDistribution(f),
  ]);

  if (!heatmap) {
    container.innerHTML = '<div class="empty-state"><h3>No pattern data</h3></div>';
    return;
  }

  // Find max value for colour scaling
  let maxVal = 0;
  for (const row of heatmap.heatmap) for (const v of row) if (v > maxVal) maxVal = v;

  const cellsHtml = buildHeatmapHtml(heatmap.heatmap, maxVal);

  container.innerHTML = `
    <div class="page-header">
      <h1>Work Patterns</h1>
      <p>When and how you use Copilot throughout the week</p>
    </div>

    <div class="card">
      <div class="card-title">Activity Heatmap (Day x Hour)</div>
      <div style="overflow-x:auto">${cellsHtml}</div>
    </div>

    <div class="grid-2">
      <div class="card" style="display:flex;flex-direction:column">
        <div class="card-title">Hourly by Work Type</div>
        <div class="chart-wrap" style="height:calc(85vh - 365px);min-height:263px"><canvas id="chart-hourly-type"></canvas></div>
      </div>
      <div class="card" style="display:flex;flex-direction:column">
        <div class="card-title">Work Type Breakdown</div>
        <div class="chart-wrap" style="height:calc(85vh - 365px);min-height:263px"><canvas id="chart-work-types"></canvas></div>
      </div>
    </div>
  `;

  // Hourly stacked bar by work type
  if (hourly && hourly.byType) {
    const types = Object.keys(hourly.byType).filter(t => {
      return hourly.byType[t].some((v: number) => v > 0);
    });
    trackChart(new Chart(document.getElementById('chart-hourly-type') as HTMLCanvasElement, {
      type: 'bar',
      data: {
        labels: Array.from({ length: 24 }, (_, i) => `${i}:00`),
        datasets: types.map((t, i) => ({
          label: t,
          data: hourly.byType[t],
          backgroundColor: WORK_TYPE_COLORS[t] || COLORS[i % COLORS.length],
        })),
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        scales: { x: { stacked: true, grid: { display: false } }, y: { stacked: true, beginAtZero: true } },
        plugins: { legend: { position: 'bottom' } },
      },
    }));
  }

  // Work type doughnut
  if (hourly && hourly.byType) {
    const types = Object.keys(hourly.byType);
    const totals = types.map(t => hourly.byType[t].reduce((a: number, b: number) => a + b, 0)).filter(v => v > 0);
    const nonZeroTypes = types.filter((_, i) => {
      return hourly.byType[types[i]].reduce((a: number, b: number) => a + b, 0) > 0;
    });
    trackChart(new Chart(document.getElementById('chart-work-types') as HTMLCanvasElement, {
      type: 'doughnut',
      data: {
        labels: nonZeroTypes,
        datasets: [{
          data: nonZeroTypes.map(t => hourly.byType[t].reduce((a: number, b: number) => a + b, 0)),
          backgroundColor: nonZeroTypes.map((t, i) => WORK_TYPE_COLORS[t] || COLORS[i % COLORS.length]),
          borderWidth: 0,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        cutout: '60%',
        plugins: { legend: { position: 'right' } },
      },
    }));
  }
}

function buildHeatmapHtml(heatmap: number[][], maxVal: number): string {
  const hours = Array.from({ length: 24 }, (_, i) => `${i}`);

  let html = '<table style="border-collapse:separate;border-spacing:3px;">';
  html += '<tr><th></th>';
  for (const h of hours) html += `<th style="text-align:center;font-size:10px;color:var(--fg-subtle);font-weight:400;padding:2px 0">${h}</th>`;
  html += '</tr>';

  for (let d = 0; d < 7; d++) {
    html += `<tr><td style="text-align:right;padding-right:8px;font-size:11px;color:var(--fg-subtle)">${DAYS[d]}</td>`;
    for (let h = 0; h < 24; h++) {
      const val = heatmap[d][h];
      const intensity = maxVal > 0 ? val / maxVal : 0;
      const bg = intensity === 0
        ? 'var(--bg-subtle)'
        : `rgba(88,166,255,${0.15 + intensity * 0.7})`;
      html += `<td style="width:22px;height:26px;border-radius:3px;background:${bg};text-align:center;font-size:9px;color:${intensity > 0.4 ? '#fff' : 'var(--fg-subtle)'}" title="${DAYS[d]} ${h}:00 — ${val} requests">${val || ''}</td>`;
    }
    html += '</tr>';
  }
  html += '</table>';
  return html;
}
