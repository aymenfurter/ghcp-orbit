/* Agentic Autonomy Tracker page */
import { Chart } from 'chart.js';
import { trackChart, COLORS, fmtNum, getWorkspaceFilter } from '../app';
import { redact, isHidden, resetRedactCounters } from '../redact';

const MCP_SERVER_LABELS: Record<string, string> = {
  mslearnmcp: 'Microsoft Learn',
  'msxp-dynamics': 'Dynamics 365',
  databricks: 'Databricks',
  playwright: 'Playwright',
  azuredevops: 'Azure DevOps',
  pylance: 'Pylance',
  azure: 'Azure',
  'gh-issues': 'GitHub Issues',
  markitdown: 'MarkItDown',
  microsoft: 'Microsoft',
};

function mcpLabel(server: string): string {
  if (isHidden('hiddenMcpServers', server)) return redact('hiddenMcpServers', server);
  return MCP_SERVER_LABELS[server] || server;
}

export async function renderAutonomy(container: HTMLElement): Promise<void> {
  resetRedactCounters();
  const f = getWorkspaceFilter();
  const data = await window.orbit.getAutonomy(f);
  if (!data || data.totalRequests === 0) {
    container.innerHTML = '<div class="empty-state"><h3>No sessions found</h3><p>Adjust filters or scan more logs</p></div>';
    return;
  }

  const scoreColor = data.delegationScore >= 70 ? COLORS[1] : data.delegationScore >= 40 ? COLORS[3] : COLORS[4];
  const privColor = data.privilegeStats.highPct > 50 ? '#f85149' : data.privilegeStats.highPct > 25 ? '#d29922' : '#3fb950';
  const cs = data.confirmationStats;
  const manualPct = cs.total > 0 ? Math.round(cs.manuallyApproved / cs.total * 1000) / 10 : 0;

  // Risk assessment: auto-approve enabled (type=3 seen) + terminal on host is the dangerous combo
  // VS Code records terminal auto-approve as type=4 (same as manual), so we detect it
  // by checking if auto-approve is enabled at all AND terminal commands ran on host
  const hasHostTerminals = cs.terminalOnHost > 0;
  const hasAutoApproveEnabled = cs.autoApproved > 0;
  const riskLevel = (hasHostTerminals && hasAutoApproveEnabled) ? 'critical' : hasHostTerminals ? 'warning' : 'good';
  const riskColor = riskLevel === 'critical' ? '#f85149' : riskLevel === 'warning' ? '#d29922' : '#3fb950';

  container.innerHTML = `
    <div class="page-header">
      <h1>Agentic Autonomy Tracker</h1>
      <p>Measure delegation, privilege risk, and human-in-the-loop patterns</p>
    </div>

    <div class="stats-row">
      <div class="stat-card">
        <div class="stat-label">Delegation Score</div>
        <div class="stat-value" style="color:${scoreColor}">${data.delegationScore}/100</div>
        <div class="stat-sub">${data.delegationScore >= 70 ? 'Excellent' : data.delegationScore >= 40 ? 'Moderate' : 'Low'} delegation</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Autonomy Rate</div>
        <div class="stat-value">${data.autonomyRate}%</div>
        <div class="stat-sub">${fmtNum(data.withToolCalls)} of ${fmtNum(data.totalRequests)} with tools</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">High Privilege</div>
        <div class="stat-value" style="color:${privColor}">${data.privilegeStats.highPct}%</div>
        <div class="stat-sub">${fmtNum(data.privilegeStats.high)} high-priv calls</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Manual Approval</div>
        <div class="stat-value">${manualPct}%</div>
        <div class="stat-sub">${fmtNum(cs.manuallyApproved)} of ${fmtNum(cs.total)} confirmations</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Safety Risk</div>
        <div class="stat-value" style="color:${riskColor}">${riskLevel === 'critical' ? 'Critical' : riskLevel === 'warning' ? 'Warning' : 'Good'}</div>
        <div class="stat-sub">${riskLevel === 'critical' ? 'Auto-approve + terminal on host' : hasHostTerminals ? cs.terminalOnHost + ' terminal on host' : 'No risky patterns'}</div>
      </div>
    </div>

    ${riskLevel !== 'good' ? `
    <div class="card" style="border:1px solid ${riskColor}44;background:${riskColor}08">
      <div class="card-title" style="color:${riskColor}">${riskLevel === 'critical' ? 'Critical Safety Alert' : 'Safety Warning'}: Terminal Execution on Host</div>
      <div style="padding:0 16px 16px">
        ${riskLevel === 'critical' ? `
          <p style="color:#e6edf3;margin:0 0 12px">
            <strong>You have auto-approve enabled and ${fmtNum(cs.terminalOnHost)} terminal commands ran on your host machine.</strong>
            With auto-approve on, the AI can execute arbitrary commands on your real system without human review.
            VS Code does not distinguish auto-approved terminal commands from manually approved ones, so any of these could have been auto-approved.
          </p>
          <p style="color:#d29922;margin:0 0 12px"><strong>Recommendation:</strong> Use a dev container for agentic sessions, or disable auto-approve for terminal commands when working on host.</p>
        ` : `
          <p style="color:#e6edf3;margin:0 0 12px">
            <strong>${fmtNum(cs.terminalOnHost)} terminal command${cs.terminalOnHost > 1 ? 's were' : ' was'} executed on your host machine.</strong>
            Consider using a dev container to isolate agent actions from your real system.
          </p>
        `}
        ${data.hostTerminalWarnings.length > 0 ? `
          <div style="margin-top:8px">
            <strong style="font-size:12px;color:#8b949e">Recent host terminal commands:</strong>
            <div style="margin-top:4px">
              ${data.hostTerminalWarnings.map(w => `
                <div style="font-family:monospace;font-size:11px;padding:4px 8px;margin:2px 0;background:#161b2266;border-radius:4px;color:#e6edf3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${w.commandLine.replace(/"/g, '&quot;')}">
                  <span style="color:#8b949e">${w.workspace}:</span> ${w.commandLine}
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}
      </div>
    </div>
    ` : ''}

    <div class="grid-2">
      <div class="card">
        <div class="card-title">Privilege Distribution</div>
        <div class="chart-wrap"><canvas id="chart-auto-priv"></canvas></div>
      </div>
      <div class="card">
        <div class="card-title">Human-in-the-Loop</div>
        <div class="chart-wrap"><canvas id="chart-auto-confirm"></canvas></div>
      </div>
    </div>

    <div class="grid-2">
      <div class="card">
        <div class="card-title">Execution Environment</div>
        <div class="chart-wrap"><canvas id="chart-auto-env"></canvas></div>
      </div>
      <div class="card">
        <div class="card-title">Automation Opportunities</div>
        <div style="padding:16px">
          <div style="display:flex;gap:16px;margin-bottom:16px">
            <div style="flex:1;background:#161b2266;border-radius:8px;padding:16px;text-align:center">
              <div style="font-size:28px;font-weight:700;color:${data.automationOpportunities.manualPct > 50 ? '#d29922' : '#3fb950'}">${data.automationOpportunities.manualPct}%</div>
              <div style="font-size:12px;color:#8b949e;margin-top:4px">Manual / Conversational</div>
            </div>
            <div style="flex:1;background:#161b2266;border-radius:8px;padding:16px;text-align:center">
              <div style="font-size:28px;font-weight:700;color:#58a6ff">${fmtNum(data.automationOpportunities.manualConversational)}</div>
              <div style="font-size:12px;color:#8b949e;margin-top:4px">Requests without tools</div>
            </div>
          </div>
          <div style="background:#0d1117;border-radius:6px;padding:12px;border-left:3px solid ${data.automationOpportunities.manualPct > 50 ? '#d29922' : data.automationOpportunities.manualPct > 30 ? '#58a6ff' : '#3fb950'}">
            <p style="margin:0;color:#e6edf3;font-size:13px">${data.automationOpportunities.suggestion}</p>
          </div>
          ${cs.terminalInDevcontainer > 0 ? `
            <div style="margin-top:12px;background:#0d111766;border-radius:6px;padding:12px;border-left:3px solid #3fb950">
              <p style="margin:0;color:#3fb950;font-size:13px;font-weight:600">Good: ${cs.terminalInDevcontainer} terminal commands in dev container</p>
              <p style="margin:4px 0 0;color:#8b949e;font-size:12px">Running terminal commands in a dev container shows effective delegation with proper isolation.</p>
            </div>
          ` : ''}
        </div>
      </div>
    </div>

    <div class="grid-2">
      <div class="card">
        <div class="card-title">Tool Usage Breakdown (Top 20)</div>
        <div class="table-scroll">
          <table class="data-table">
            <thead><tr><th>Tool</th><th>Category</th><th>Calls</th><th>Privilege</th></tr></thead>
            <tbody>
              ${data.toolBreakdown.slice(0, 20).map((t: any) => `
                <tr>
                  <td style="font-family:monospace;font-size:12px">${t.tool}</td>
                  <td>${t.category}</td>
                  <td>${fmtNum(t.count)}</td>
                  <td><span style="color:${t.privilege === 'high' ? '#f85149' : t.privilege === 'medium' ? '#d29922' : '#3fb950'};font-weight:600;text-transform:uppercase;font-size:11px">${t.privilege}</span></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
      ${data.mcpBreakdown.length ? `
      <div class="card">
        <div class="card-title">MCP Server Usage</div>
        <div class="table-scroll">
          <table class="data-table">
            <thead><tr><th>Server</th><th>Calls</th><th>Capabilities</th><th>Tools</th></tr></thead>
            <tbody>
              ${data.mcpBreakdown.map((m: any) => {
                const label = mcpLabel(m.server);
                const hidden = isHidden('hiddenMcpServers', m.server);
                const cats = (m.toolCategories || []).map((c: string) => '<span style="display:inline-block;padding:1px 6px;background:#30363d;border-radius:3px;font-size:10px;margin:1px 2px;color:#e6edf3">' + c + '</span>').join('');
                const tools = hidden ? '<span style="color:#8b949e">redacted</span>' : m.tools.slice(0, 5).join(', ') + (m.tools.length > 5 ? ' +' + (m.tools.length - 5) + ' more' : '');
                return '<tr><td style="font-weight:600">' + label + '</td><td>' + fmtNum(m.count) + '</td><td>' + (cats || '<span style="color:#8b949e">-</span>') + '</td><td style="font-size:12px;color:#8b949e">' + tools + '</td></tr>';
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
      ` : `
      <div class="card">
        <div class="card-title">MCP Server Usage</div>
        <div style="padding:20px;text-align:center;color:#8b949e">No MCP tools detected in your sessions</div>
      </div>
      `}
    </div>

    ${data.byWorkType.length ? `
    <div class="card">
      <div class="card-title">Autonomy by Work Type</div>
      <div class="table-scroll">
        <table class="data-table">
          <thead><tr><th>Work Type</th><th>Requests</th><th>Autonomy Rate</th></tr></thead>
          <tbody>
            ${data.byWorkType.map((w: any) => `
              <tr>
                <td>${w.workType}</td>
                <td>${fmtNum(w.count)}</td>
                <td>${w.autonomyRate}%</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
    ` : ''}

    ${cs.total > 0 ? `
    <div class="card">
      <div class="card-title">Confirmation Breakdown</div>
      <div style="padding:16px">
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-bottom:20px">
          <div style="background:#161b2266;border-radius:8px;padding:16px;text-align:center">
            <div style="font-size:24px;font-weight:700;color:#3fb950">${fmtNum(cs.autoSafe)}</div>
            <div style="font-size:12px;color:#8b949e;margin-top:4px">Auto (Safe)</div>
            <div style="font-size:11px;color:#484f58;margin-top:2px">Reads, searches</div>
          </div>
          <div style="background:#161b2266;border-radius:8px;padding:16px;text-align:center">
            <div style="font-size:24px;font-weight:700;color:#d29922">${fmtNum(cs.autoApproved)}</div>
            <div style="font-size:12px;color:#8b949e;margin-top:4px">Auto-Approved</div>
            <div style="font-size:11px;color:#484f58;margin-top:2px">By user settings</div>
          </div>
          <div style="background:#161b2266;border-radius:8px;padding:16px;text-align:center">
            <div style="font-size:24px;font-weight:700;color:#58a6ff">${fmtNum(cs.manuallyApproved)}</div>
            <div style="font-size:12px;color:#8b949e;margin-top:4px">Manually Confirmed</div>
            <div style="font-size:11px;color:#484f58;margin-top:2px">User clicked accept</div>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
          <div style="background:#161b2266;border-radius:8px;padding:16px">
            <div style="font-size:13px;color:#e6edf3;margin-bottom:8px">Terminal on Host</div>
            <div style="font-size:24px;font-weight:700;color:${cs.terminalOnHost > 0 ? '#d29922' : '#3fb950'}">${fmtNum(cs.terminalOnHost)}</div>
            ${hasAutoApproveEnabled && cs.terminalOnHost > 0 ? '<div style="font-size:11px;color:#f85149;margin-top:4px">Auto-approve is enabled — some may lack human review</div>' : ''}
          </div>
          <div style="background:#161b2266;border-radius:8px;padding:16px">
            <div style="font-size:13px;color:#e6edf3;margin-bottom:8px">Terminal in Dev Container</div>
            <div style="font-size:24px;font-weight:700;color:#3fb950">${fmtNum(cs.terminalInDevcontainer)}</div>
            <div style="font-size:11px;color:#8b949e;margin-top:4px">Safely isolated</div>
          </div>
        </div>
      </div>
    </div>
    ` : ''}
  `;

  // Privilege doughnut
  trackChart(new Chart(document.getElementById('chart-auto-priv') as HTMLCanvasElement, {
    type: 'doughnut',
    data: {
      labels: ['High Privilege', 'Medium Privilege', 'Low Privilege'],
      datasets: [{
        data: [data.privilegeStats.high, data.privilegeStats.medium, data.privilegeStats.low],
        backgroundColor: ['#f85149cc', '#d29922cc', '#3fb950cc'],
        borderWidth: 0,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      cutout: '55%',
      plugins: {
        legend: { position: 'bottom', labels: { color: '#e6edf3', padding: 12 } },
      },
    },
  }));

  // Human-in-the-loop doughnut
  if (cs.total > 0) {
    trackChart(new Chart(document.getElementById('chart-auto-confirm') as HTMLCanvasElement, {
      type: 'doughnut',
      data: {
        labels: ['Auto (Safe)', 'Auto-Approved (Settings)', 'Manually Confirmed'],
        datasets: [{
          data: [cs.autoSafe, cs.autoApproved, cs.manuallyApproved],
          backgroundColor: ['#3fb950cc', '#d29922cc', '#58a6ffcc'],
          borderWidth: 0,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        cutout: '55%',
        plugins: {
          legend: { position: 'bottom', labels: { color: '#e6edf3', padding: 12 } },
        },
      },
    }));
  } else {
    const confirmCanvas = document.getElementById('chart-auto-confirm') as HTMLCanvasElement;
    if (confirmCanvas?.parentElement) confirmCanvas.parentElement.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#8b949e">No confirmation data available</div>';
  }

  // Environment bar
  const envData = data.environmentBreakdown;
  if (envData.length > 0) {
    trackChart(new Chart(document.getElementById('chart-auto-env') as HTMLCanvasElement, {
      type: 'bar',
      data: {
        labels: envData.map((e: any) => e.environment === 'host' ? 'Host Machine' : e.environment === 'devcontainer' ? 'Dev Container' : 'Unknown'),
        datasets: [{
          label: 'Requests with Tools',
          data: envData.map((e: any) => e.count),
          backgroundColor: envData.map((e: any) => e.environment === 'devcontainer' ? '#3fb950cc' : e.environment === 'host' ? '#d29922cc' : '#8b949ecc'),
          borderWidth: 0,
          borderRadius: 4,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, title: { display: true, text: 'Requests with Tools' } },
        },
      },
    }));
  } else {
    const envCanvas = document.getElementById('chart-auto-env') as HTMLCanvasElement;
    if (envCanvas?.parentElement) envCanvas.parentElement.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#8b949e">No tool usage data</div>';
  }
}
