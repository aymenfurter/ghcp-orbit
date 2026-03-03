/* Anti-Pattern Detector page */
import { Chart } from 'chart.js';
import { trackChart, COLORS, fmtNum, getWorkspaceFilter } from '../app';

export async function renderAntiPatterns(container: HTMLElement): Promise<void> {
  const f = getWorkspaceFilter();
  const data = await window.orbit.getAntiPatterns(f);
  if (!data || data.patterns.length === 0) {
    container.innerHTML = '<div class="empty-state"><h3>No anti-patterns detected</h3><p>Great job! Keep up the good habits.</p></div>';
    return;
  }

  type Severity = 'high' | 'medium' | 'low';
  interface Pattern { name: string; severity: Severity; occurrences: number; description: string; suggestion: string; examples?: string[] }
  const sevColor = (s: string) => s === 'high' ? '#f85149' : s === 'medium' ? '#d29922' : '#3fb950';
  const sevBg = (s: string) => s === 'high' ? '#f8514922' : s === 'medium' ? '#d2992222' : '#3fb95022';
  // Compute health score: 100 minus penalty for each pattern (high=20, medium=10, low=5), clamped 0-100
  const healthScore = Math.max(0, 100 - (data.patterns as Pattern[]).reduce((sum: number, p: Pattern) => sum + (p.severity === 'high' ? 20 : p.severity === 'medium' ? 10 : 5), 0));
  const healthColor = healthScore >= 80 ? COLORS[1] : healthScore >= 50 ? COLORS[3] : COLORS[4];

  container.innerHTML = `
    <div class="page-header">
      <h1>Anti-Pattern Detector</h1>
      <p>Identify and eliminate unproductive AI collaboration habits</p>
    </div>

    <div class="stats-row">
      <div class="stat-card">
        <div class="stat-label">Health Score</div>
        <div class="stat-value" style="color:${healthColor}">${healthScore}/100</div>
        <div class="stat-sub">${healthScore >= 80 ? 'Healthy' : healthScore >= 50 ? 'Needs attention' : 'Critical'}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Patterns Found</div>
        <div class="stat-value">${data.patterns.length}</div>
        <div class="stat-sub">${(data.patterns as Pattern[]).filter((p: Pattern) => p.severity === 'high').length} high severity</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Total Occurrences</div>
        <div class="stat-value">${fmtNum(data.totalOccurrences)}</div>
        <div class="stat-sub">across all sessions</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Worst Pattern</div>
        <div class="stat-value" style="font-size:14px">${data.patterns[0]?.name || 'None'}</div>
        <div class="stat-sub">${data.patterns[0]?.occurrences || 0} occurrences</div>
      </div>
    </div>

    <div class="grid-2">
      <div class="card">
        <div class="card-title">Severity Distribution</div>
        <div class="chart-wrap"><canvas id="chart-ap-severity"></canvas></div>
      </div>
      <div class="card">
        <div class="card-title">Occurrences by Pattern</div>
        <div class="chart-wrap"><canvas id="chart-ap-bar"></canvas></div>
      </div>
    </div>

    <div class="card">
      <div class="card-title">Detected Anti-Patterns</div>
      <div id="ap-cards" style="display:grid;gap:12px;padding:8px 0">
        ${(data.patterns as Pattern[]).map((p: Pattern) => `
          <div style="border:1px solid ${sevColor(p.severity)};border-left:4px solid ${sevColor(p.severity)};background:${sevBg(p.severity)};border-radius:8px;padding:16px">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
              <div style="font-weight:600;font-size:15px;color:#e6edf3">${p.name}</div>
              <div style="display:flex;gap:8px;align-items:center">
                <span style="background:${sevColor(p.severity)};color:#fff;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;text-transform:uppercase">${p.severity}</span>
                <span style="color:#8b949e;font-size:13px">${fmtNum(p.occurrences)} occurrences</span>
              </div>
            </div>
            <div style="color:#8b949e;font-size:13px;margin-bottom:8px">${p.description}</div>
            <div style="color:#d2a8ff;font-size:13px;margin-bottom:${p.examples?.length ? '8' : '0'}px"><strong>Tip:</strong> ${p.suggestion}</div>
            ${p.examples?.length ? `
              <div style="border-top:1px solid #30363d;padding-top:8px;margin-top:4px">
                <div style="color:#58a6ff;font-size:12px;font-weight:600;margin-bottom:4px">Examples:</div>
                <ul style="margin:0;padding-left:20px;font-size:12px;color:#8b949e;list-style:disc">
                  ${p.examples.slice(0, 5).map(e => `<li style="margin-bottom:2px">${e}</li>`).join('')}
                </ul>
              </div>
            ` : ''}
          </div>
        `).join('')}
      </div>
    </div>
  `;

  // Severity doughnut
  const sevCounts = { high: 0, medium: 0, low: 0 };
  (data.patterns as Pattern[]).forEach((p: Pattern) => sevCounts[p.severity]++);
  trackChart(new Chart(document.getElementById('chart-ap-severity') as HTMLCanvasElement, {
    type: 'doughnut',
    data: {
      labels: ['High', 'Medium', 'Low'],
      datasets: [{
        data: [sevCounts.high, sevCounts.medium, sevCounts.low],
        backgroundColor: ['#f85149cc', '#d29922cc', '#3fb950cc'],
        borderWidth: 0,
      }],
    },
    options: { responsive: true, maintainAspectRatio: false, cutout: '60%' },
  }));

  // Occurrences bar
  trackChart(new Chart(document.getElementById('chart-ap-bar') as HTMLCanvasElement, {
    type: 'bar',
    data: {
      labels: (data.patterns as Pattern[]).map((p: Pattern) => p.name),
      datasets: [{
        label: 'Occurrences',
        data: (data.patterns as Pattern[]).map((p: Pattern) => p.occurrences),
        backgroundColor: (data.patterns as Pattern[]).map((p: Pattern) => sevColor(p.severity) + 'cc'),
        borderWidth: 1,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      indexAxis: 'y',
      plugins: { legend: { display: false } },
      scales: { x: { beginAtZero: true } },
    },
  }));
}
