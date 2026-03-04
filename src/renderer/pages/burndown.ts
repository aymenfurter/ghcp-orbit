/* Token Burndown page */
import { Chart } from 'chart.js';
import { trackChart, fmtNum } from '../app';

export async function renderBurndown(container: HTMLElement): Promise<void> {
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  container.innerHTML = `
    <div class="page-header">
      <h1>Token Burndown</h1>
      <p>Premium request budget tracking</p>
    </div>

    <div class="filter-bar">
      <label>Month:</label>
      <input type="month" id="month-input" value="${currentMonth}">
      <label style="margin-left:12px">Plan:</label>
      <select id="sku-select">
        <option value="pro">Copilot Pro (300)</option>
        <option value="pro-plus">Copilot Pro+ (1,500)</option>
        <option value="business">Copilot Business (300)</option>
        <option value="enterprise">Copilot Enterprise (1,000)</option>
      </select>
      <label style="margin-left:12px">Custom Budget:</label>
      <input type="text" id="custom-budget" placeholder="Optional" style="width:80px">
      <button class="pill active" id="btn-apply" style="margin-left:8px">Apply</button>
    </div>

    <div id="burndown-content">
      <div class="loading-inline"><div class="loading-spinner"></div>Calculating...</div>
    </div>
  `;

  const load = async () => {
    const sku = (document.getElementById('sku-select') as HTMLSelectElement).value;
    const customStr = (document.getElementById('custom-budget') as HTMLInputElement).value.trim();
    const customBudget = customStr ? parseInt(customStr, 10) : undefined;
    const month = (document.getElementById('month-input') as HTMLInputElement).value || undefined;
    const cfg = {
      sku,
      customBudget: customBudget && !isNaN(customBudget) ? customBudget : undefined,
      month: month !== currentMonth ? month : undefined,
    };
    const data = await window.orbit.getBurndown(cfg);
    renderBurndownContent(data);
  };

  document.getElementById('btn-apply')?.addEventListener('click', load);
  document.getElementById('month-input')?.addEventListener('change', load);
  await load();
}

function renderBurndownContent(data: any) {
  const el = document.getElementById('burndown-content');
  if (!el || !data) return;

  const statusClass = data.status === 'on-track' ? 'on-track' : data.status === 'warning' ? 'warning' : 'over-budget';
  const statusLabel = data.status === 'on-track' ? 'On Track' : data.status === 'warning' ? 'Warning' : 'Over Budget';
  const pctUsed = data.budget > 0 ? Math.round(data.consumed / data.budget * 100) : 0;

  el.innerHTML = `
    <div class="stats-row">
      <div class="stat-card">
        <div class="stat-label">Month</div>
        <div class="stat-value">${data.currentMonth}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Budget</div>
        <div class="stat-value blue">${fmtNum(data.budget)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Consumed</div>
        <div class="stat-value ${pctUsed > 85 ? 'red' : pctUsed > 50 ? 'orange' : 'green'}">${fmtNum(data.consumed)}</div>
        <div class="stat-sub">${pctUsed}% of budget</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Projected</div>
        <div class="stat-value ${data.projected > data.budget ? 'red' : 'green'}">${fmtNum(data.projected)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Day</div>
        <div class="stat-value">${data.dayOfMonth} / ${data.daysInMonth}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Status</div>
        <div class="burndown-status ${statusClass}">${statusLabel}</div>
      </div>
    </div>

    <div class="card">
      <div class="card-title">Recommendation</div>
      <p style="color:var(--fg-muted);line-height:1.6">${data.recommendation}</p>
    </div>

    <div class="card">
      <div class="card-title">Burndown Chart</div>
      <div class="chart-wrap" style="height:326px"><canvas id="chart-burndown"></canvas></div>
    </div>

    <div class="card">
      <div class="card-title">Daily Consumption</div>
      <div class="chart-wrap" style="height:257px"><canvas id="chart-daily-consumption"></canvas></div>
    </div>
  `;

  // Burndown chart: cumulative vs projected vs budget
  const dc = data.dailyConsumption;
  if (dc && dc.labels) {
    trackChart(new Chart(document.getElementById('chart-burndown') as HTMLCanvasElement, {
      type: 'line',
      data: {
        labels: dc.labels.map((l: string) => l.slice(-2)),
        datasets: [
          {
            label: 'Cumulative',
            data: dc.cumulative.map((v: number, i: number) => i < data.dayOfMonth ? v : null),
            borderColor: '#58a6ff',
            backgroundColor: 'rgba(88,166,255,0.1)',
            fill: true,
            tension: 0.2,
            pointRadius: 0,
            borderWidth: 2,
          },
          {
            label: 'Projected',
            data: data.projectedLine,
            borderColor: data.projected > data.budget ? '#f85149' : '#d29922',
            borderDash: [6, 3],
            borderWidth: 2,
            pointRadius: 0,
            fill: false,
          },
          {
            label: 'Budget',
            data: data.budgetLine,
            borderColor: '#3fb950',
            borderDash: [3, 3],
            borderWidth: 1.5,
            pointRadius: 0,
            fill: false,
          },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        scales: {
          x: { grid: { display: false } },
          y: { beginAtZero: true, title: { display: true, text: 'Premium Requests' } },
        },
        plugins: { legend: { position: 'top' } },
      },
    }));
  }

  // Daily bar chart
  if (dc && dc.values) {
    trackChart(new Chart(document.getElementById('chart-daily-consumption') as HTMLCanvasElement, {
      type: 'bar',
      data: {
        labels: dc.labels.map((l: string) => l.slice(-2)),
        datasets: [{
          data: dc.values.map((v: number, i: number) => i < data.dayOfMonth ? v : null),
          backgroundColor: dc.values.map((v: number, i: number) =>
            i < data.dayOfMonth ? 'rgba(88,166,255,0.6)' : 'rgba(88,166,255,0.1)'
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
}
