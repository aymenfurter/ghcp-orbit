/* Sessions page – paginated session list + detail view */
import { fmtDate, fmtTime, fmtNum, getWorkspaceFilter } from '../app';

let currentPage = 1;
const PAGE_SIZE = 30;
let currentFilter: any = {};
let containerRef: HTMLElement | null = null;

export async function renderSessions(container: HTMLElement): Promise<void> {
  containerRef = container;
  currentPage = 1;
  currentFilter = getWorkspaceFilter();

  container.innerHTML = `
    <div class="page-header">
      <h1>Sessions</h1>
      <p>Browse and inspect individual chat sessions</p>
    </div>

    <div id="sessions-list">
      <div class="loading-inline"><div class="loading-spinner"></div>Loading...</div>
    </div>
  `;

  await loadSessions();
}

async function loadSessions() {
  const el = document.getElementById('sessions-list');
  if (!el) return;
  el.innerHTML = '<div class="loading-inline"><div class="loading-spinner"></div>Loading...</div>';

  const data = await window.orbit.getSessions(currentFilter, currentPage, PAGE_SIZE);
  if (!data || !data.sessions || data.sessions.length === 0) {
    el.innerHTML = '<div class="empty-state"><h3>No sessions found</h3></div>';
    return;
  }

  const totalPages = Math.ceil(data.total / data.pageSize);

  let html = `<div class="text-sm text-muted mb-8">${data.total} sessions total</div>`;

  for (const s of data.sessions) {
    html += `
      <div class="session-item" data-sid="${escapeAttr(s.sessionId)}">
        <div class="session-name">${escapeHtml(s.workspaceName || 'Unknown')} <span class="badge">${s.requestCount} msgs</span></div>
        <div class="session-meta">
          <span>${fmtDate(s.creationDate)}</span>
          <span>${fmtTime(s.creationDate)}</span>
          ${s.lastMessageDate ? `<span>Last: ${fmtTime(s.lastMessageDate)}</span>` : ''}
        </div>
        ${s.firstMessage ? `<div class="text-sm text-muted mt-8" style="font-style:italic">${escapeHtml(s.firstMessage.slice(0, 150))}</div>` : ''}
      </div>
    `;
  }

  html += `
    <div class="pagination">
      <button id="pg-prev" ${currentPage <= 1 ? 'disabled' : ''}>Prev</button>
      <span class="page-info">Page ${currentPage} of ${totalPages}</span>
      <button id="pg-next" ${currentPage >= totalPages ? 'disabled' : ''}>Next</button>
    </div>
  `;

  el.innerHTML = html;

  // Pagination
  document.getElementById('pg-prev')?.addEventListener('click', () => {
    if (currentPage > 1) { currentPage--; loadSessions(); }
  });
  document.getElementById('pg-next')?.addEventListener('click', () => {
    if (currentPage < totalPages) { currentPage++; loadSessions(); }
  });

  // Session detail click
  el.querySelectorAll('.session-item').forEach(item => {
    item.addEventListener('click', () => {
      const sid = item.getAttribute('data-sid');
      if (sid) loadSessionDetail(sid);
    });
  });
}

async function loadSessionDetail(sessionId: string) {
  const el = document.getElementById('sessions-list');
  if (!el) return;
  el.innerHTML = '<div class="loading-inline"><div class="loading-spinner"></div>Loading session...</div>';

  const detail = await window.orbit.getSessionDetail(sessionId);
  if (!detail) {
    el.innerHTML = '<div class="empty-state"><h3>Session not found</h3></div>';
    return;
  }

  let html = `
    <button class="pill mb-16" id="btn-back">&larr; Back to list</button>
    <div class="card mb-16">
      <div class="card-title">${escapeHtml(detail.workspaceName)}</div>
      <div class="session-meta">
        <span>Session: ${detail.sessionId.slice(0, 12)}...</span>
        <span>Created: ${fmtDate(detail.creationDate)}</span>
        <span>${detail.requestCount} messages</span>
      </div>
    </div>
    <div class="message-thread">
  `;

  for (const r of detail.requests) {
    // User message
    if (r.messageText) {
      html += `
        <div class="message-bubble user">
          <div class="role-label">You</div>
          ${formatMessage(r.messageText)}
        </div>
      `;
    }

    // Assistant response
    if (r.responseText) {
      const meta: string[] = [];
      if (r.modelId) meta.push(r.modelId.split('/').pop() || r.modelId);
      if (r.agentName) meta.push(`@${r.agentName}`);
      if (r.editLocTotal) meta.push(`${r.editLocTotal} LoC`);
      if (r.toolsUsed?.length) meta.push(`${r.toolsUsed.length} tools`);

      html += `
        <div class="message-bubble assistant">
          <div class="role-label">Copilot${meta.length ? ` · ${meta.join(' · ')}` : ''}</div>
          ${formatMessage(r.responseText.slice(0, 2000))}
          ${r.responseText.length > 2000 ? '<div class="text-xs text-subtle mt-8">... truncated</div>' : ''}
        </div>
      `;
    }
  }

  html += '</div>';
  el.innerHTML = html;

  document.getElementById('btn-back')?.addEventListener('click', () => {
    loadSessions();
  });
}

function formatMessage(text: string): string {
  // Simple markdown-ish rendering
  let escaped = escapeHtml(text);
  // Code blocks
  escaped = escaped.replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>');
  // Inline code
  escaped = escaped.replace(/`([^`]+)`/g, '<code>$1</code>');
  // Bold
  escaped = escaped.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  // Line breaks
  escaped = escaped.replace(/\n/g, '<br>');
  return escaped;
}

function escapeHtml(str: string): string {
  const el = document.createElement('span');
  el.textContent = str;
  return el.innerHTML;
}

function escapeAttr(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}
