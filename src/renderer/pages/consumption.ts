/* Consumption page — premium request cost + 2010s LoC value */
import { Chart } from 'chart.js';
import { trackChart, destroyCharts, COLORS, fmtNum, getWorkspaceFilter } from '../app';

let cachedData: any = null;
let cachedProd: any = null;
const PREMIUM_PRICE = 0.04; // $/premium request

export async function renderConsumption(container: HTMLElement): Promise<void> {
  const [data, prodData] = await Promise.all([
    window.orbit.getConsumption(getWorkspaceFilter()),
    window.orbit.getCodeProduction(getWorkspaceFilter()),
  ]);
  if (!data || data.totalRequests === 0) {
    container.innerHTML = '<div class="empty-state"><h3>No consumption data</h3></div>';
    return;
  }
  cachedData = data;
  cachedProd = prodData;

  const multipliers: Record<string, number> = data.defaultMultipliers || {};
  const modelEntries = Object.entries(data.modelTotals as Record<string, number>)
    .sort((a, b) => (b[1] as number) - (a[1] as number));

  // Compute total premium + cost
  let totalPremium = 0;
  for (const [model, count] of modelEntries) {
    totalPremium += (count as number) * (multipliers[model] ?? 1);
  }
  const totalCost = totalPremium * PREMIUM_PRICE;

  // 2010s equivalent cost
  const locCost2010 = prodData?.summary?.locCost2010 || 0;
  const totalLoc = prodData?.summary?.totalLoc || 0;
  const costPerLoc = prodData?.summary?.costPerLoc || 20;

  container.innerHTML = `
    <div class="page-header">
      <h1>Consumption</h1>
      <p>Premium request cost and model usage breakdown</p>
    </div>

    <div class="stats-row">
      <div class="stat-card">
        <div class="stat-label">Total Cost</div>
        <div class="stat-value green">$${totalCost.toFixed(2)}</div>
        <div class="stat-sub">${fmtNum(Math.round(totalPremium))} premium reqs @ $${PREMIUM_PRICE}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Raw Requests</div>
        <div class="stat-value blue">${fmtNum(data.totalRequests)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Avg Cost / Day</div>
        <div class="stat-value">$${(totalCost / (data.daily?.labels?.length || 1)).toFixed(2)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">2010s Equivalent</div>
        <div class="stat-value orange">$${fmtNum(locCost2010)}</div>
        <div class="stat-sub">${fmtNum(totalLoc)} LoC @ $${costPerLoc}/LoC</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">ROI vs 2010s</div>
        <div class="stat-value purple">${totalCost > 0 ? Math.round(locCost2010 / totalCost) + 'x' : 'N/A'}</div>
      </div>
    </div>

    <div class="grid-2">
      <div class="card">
        <div class="card-title">Daily Cost</div>
        <div class="tabs" id="period-tabs">
          <button class="tab active" data-period="daily">Daily</button>
          <button class="tab" data-period="weekly">Weekly</button>
          <button class="tab" data-period="monthly">Monthly</button>
        </div>
        <div class="chart-wrap" style="height:336px"><canvas id="chart-volume"></canvas></div>
      </div>
      <div class="card">
        <div class="card-title">Cumulative Cost</div>
        <div class="chart-wrap" style="height:336px"><canvas id="chart-cumulative"></canvas></div>
      </div>
    </div>

    <div class="grid-2">
      <div class="card">
        <div class="card-title">Model Usage</div>
        <div class="chart-wrap"><canvas id="chart-models"></canvas></div>
      </div>
      <div class="card" style="display:flex;flex-direction:column;overflow:hidden">
        <div class="card-title">Cost by Model</div>
        <div class="table-wrap" id="model-table" style="overflow-y:auto;flex:1"></div>
      </div>
    </div>
  `;

  // Tab switching
  container.querySelectorAll('#period-tabs .tab').forEach(btn => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('#period-tabs .tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderVolumeChart(btn.getAttribute('data-period') || 'daily');
    });
  });

  renderVolumeChart('daily');
  renderCumulativeChart();
  renderModelDoughnut(modelEntries);
  renderModelTable(modelEntries, multipliers);
}

function getWeightedSeries(labels: string[], byModel: Record<string, number[]>, multipliers: Record<string, number>): number[] {
  return labels.map((_, i) => {
    let total = 0;
    for (const [model, values] of Object.entries(byModel)) {
      total += (values[i] || 0) * (multipliers[model] ?? 1);
    }
    return Math.round(total * 100) / 100;
  });
}

function renderVolumeChart(period: string) {
  if (!cachedData) return;

  const canvas = document.getElementById('chart-volume') as HTMLCanvasElement;
  const existing = Chart.getChart(canvas);
  if (existing) existing.destroy();

  const bucket = cachedData[period] || cachedData.daily;
  if (!bucket || !bucket.labels || !bucket.labels.length) return;

  const multipliers: Record<string, number> = cachedData.defaultMultipliers || {};
  const weighted = getWeightedSeries(bucket.labels, bucket.byModel || {}, multipliers);
  const costData = weighted.map(v => +(v * PREMIUM_PRICE).toFixed(2));

  trackChart(new Chart(canvas, {
    type: 'bar',
    data: {
      labels: bucket.labels,
      datasets: [
        {
          label: 'Premium Requests',
          data: weighted,
          backgroundColor: 'rgba(88,166,255,0.6)',
          borderColor: '#58a6ff',
          borderWidth: 1,
          yAxisID: 'y',
        },
        {
          label: 'Cost ($)',
          data: costData,
          type: 'line',
          borderColor: '#3fb950',
          backgroundColor: 'rgba(63,185,80,0.1)',
          fill: true,
          tension: 0.3,
          pointRadius: 1,
          yAxisID: 'y1',
        },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      scales: {
        x: { ticks: { maxTicksLimit: 20 }, grid: { display: false } },
        y: { type: 'linear', position: 'left', beginAtZero: true, title: { display: true, text: 'Premium Requests' } },
        y1: { type: 'linear', position: 'right', beginAtZero: true, grid: { drawOnChartArea: false }, ticks: { callback: (v: any) => '$' + Number(v).toFixed(2) }, title: { display: true, text: 'Cost ($)' } },
      },
      plugins: { legend: { display: true, position: 'top' } },
    },
  }));
}

function renderCumulativeChart() {
  if (!cachedData) return;
  const canvas = document.getElementById('chart-cumulative') as HTMLCanvasElement;
  if (!canvas) return;

  const bucket = cachedData.daily;
  if (!bucket?.labels?.length) return;

  const multipliers: Record<string, number> = cachedData.defaultMultipliers || {};
  const weighted = getWeightedSeries(bucket.labels, bucket.byModel || {}, multipliers);
  const cumCost: number[] = [];
  let running = 0;
  for (const v of weighted) {
    running += v * PREMIUM_PRICE;
    cumCost.push(+running.toFixed(2));
  }

  trackChart(new Chart(canvas, {
    type: 'line',
    data: {
      labels: bucket.labels,
      datasets: [{
        label: 'Cumulative Cost ($)',
        data: cumCost,
        borderColor: '#d29922',
        backgroundColor: 'rgba(210,153,34,0.1)',
        fill: true,
        tension: 0.3,
        pointRadius: 1,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: {
        x: { ticks: { maxTicksLimit: 20 }, grid: { display: false } },
        y: { beginAtZero: true, ticks: { callback: (v: any) => '$' + Number(v).toFixed(2) } },
      },
      plugins: { legend: { display: true, position: 'top' } },
    },
  }));
}

function renderModelDoughnut(entries: [string, unknown][]) {
  const top = entries.slice(0, 8);
  const canvas = document.getElementById('chart-models') as HTMLCanvasElement;
  if (!canvas || !top.length) return;

  trackChart(new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels: top.map(e => e[0]),
      datasets: [{
        data: top.map(e => e[1] as number),
        backgroundColor: top.map((_, i) => COLORS[i % COLORS.length]),
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

function renderModelTable(entries: [string, unknown][], multipliers: Record<string, number>) {
  const el = document.getElementById('model-table');
  if (!el) return;

  const top8 = entries.slice(0, 8);
  let totalRaw = 0, totalPremium = 0;
  for (const [model, count] of entries) {
    const mult = multipliers[model] ?? 1;
    totalRaw += count as number;
    totalPremium += (count as number) * mult;
  }
  const totalCost = totalPremium * PREMIUM_PRICE;

  let html = '<table><thead><tr><th>Model</th><th>Requests</th><th>Mult.</th><th>Premium</th><th>Cost</th></tr></thead><tbody>';
  for (const [model, count] of top8) {
    const mult = multipliers[model] ?? 1;
    const premium = Math.round((count as number) * mult);
    const cost = premium * PREMIUM_PRICE;
    const dimmed = mult === 0 ? ' style="opacity:0.4"' : '';
    html += `<tr${dimmed}>
      <td>${model}</td>
      <td>${fmtNum(count as number)}</td>
      <td class="text-mono">${mult}x</td>
      <td class="text-mono">${fmtNum(premium)}</td>
      <td class="text-mono" style="color:var(--accent-green)">$${cost.toFixed(2)}</td>
    </tr>`;
  }
  html += `<tr style="border-top:2px solid var(--border-default);font-weight:600">
    <td>Total</td>
    <td>${fmtNum(totalRaw)}</td>
    <td></td>
    <td>${fmtNum(Math.round(totalPremium))}</td>
    <td style="color:var(--accent-orange)">$${totalCost.toFixed(2)}</td>
  </tr>`;
  html += '</tbody></table>';
  el.innerHTML = html;
}
