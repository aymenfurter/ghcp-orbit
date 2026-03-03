/* Settings page — manage redaction/hide filters for presentation mode */
import { loadRedactSettings, updateRedactSettings, RedactSettings } from '../redact';

function escHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export async function renderSettings(container: HTMLElement): Promise<void> {
  const [settings, available] = await Promise.all([
    loadRedactSettings(),
    window.orbit.getAvailableItems(),
  ]);

  if (!available) {
    container.innerHTML = '<div class="empty-state"><h3>No data available</h3><p>Load session data first.</p></div>';
    return;
  }

  const categories: { key: keyof RedactSettings; label: string; replacementLabel: string; items: string[] }[] = [
    { key: 'hiddenWorkspaces', label: 'Workspaces', replacementLabel: 'Custom Workspace', items: available.workspaces || [] },
    { key: 'hiddenAgentModes', label: 'Agent Modes', replacementLabel: 'Custom Mode', items: available.agentModes || [] },
    { key: 'hiddenMcpServers', label: 'MCP Servers', replacementLabel: 'Custom MCP Server', items: available.mcpServers || [] },
    { key: 'hiddenSkills', label: 'Skills', replacementLabel: 'Custom Skill', items: available.skills || [] },
  ];

  const hiddenCount = settings.hiddenWorkspaces.length + settings.hiddenMcpServers.length +
    settings.hiddenSkills.length + settings.hiddenAgentModes.length;

  container.innerHTML = `
    <div class="page-header">
      <h1>Presentation Settings</h1>
      <p>Hide specific items from the UI for clean external presentations. Hidden items are replaced with generic labels.</p>
    </div>

    <div class="stats-row">
      <div class="stat-card">
        <div class="stat-label">Hidden Items</div>
        <div class="stat-value orange" id="settings-hidden-count">${hiddenCount}</div>
        <div class="stat-sub">across all categories</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Total Items</div>
        <div class="stat-value blue">${categories.reduce((s, c) => s + c.items.length, 0)}</div>
        <div class="stat-sub">workspaces, modes, servers, skills</div>
      </div>
    </div>

    <div class="settings-actions">
      <button class="settings-btn settings-btn-primary" id="settings-save">Save Changes</button>
      <button class="settings-btn" id="settings-reset">Reset All</button>
    </div>

    <div class="settings-categories" id="settings-categories">
      ${categories.map(cat => renderCategory(cat, settings)).join('')}
    </div>
  `;

  bindEvents(container, categories, settings);
}

function renderCategory(cat: { key: keyof RedactSettings; label: string; replacementLabel: string; items: string[] }, settings: RedactSettings): string {
  const hidden = settings[cat.key];
  if (cat.items.length === 0) return '';

  return `
    <div class="card settings-category" data-key="${cat.key}">
      <div class="card-title settings-category-header">
        <span>${cat.label}</span>
        <span class="settings-category-count">${hidden.length} / ${cat.items.length} hidden</span>
      </div>
      <div class="settings-category-actions">
        <button class="settings-link" data-action="hide-all" data-key="${cat.key}">Hide All</button>
        <button class="settings-link" data-action="show-all" data-key="${cat.key}">Show All</button>
      </div>
      <div class="settings-item-list">
        ${cat.items.map(name => {
          const isHidden = hidden.includes(name);
          return `
            <label class="settings-item${isHidden ? ' settings-item-hidden' : ''}" title="${escHtml(name)}">
              <input type="checkbox" data-key="${cat.key}" data-name="${escHtml(name)}" ${isHidden ? 'checked' : ''} />
              <span class="settings-toggle"></span>
              <span class="settings-item-name">${escHtml(name)}</span>
              ${isHidden ? `<span class="settings-item-replacement">${cat.replacementLabel}</span>` : ''}
            </label>
          `;
        }).join('')}
      </div>
    </div>
  `;
}

function bindEvents(container: HTMLElement, categories: { key: keyof RedactSettings; label: string; replacementLabel: string; items: string[] }[], settings: RedactSettings): void {
  // Individual checkbox toggles
  container.querySelectorAll<HTMLInputElement>('input[type="checkbox"][data-key]').forEach(cb => {
    cb.addEventListener('change', () => {
      const key = cb.dataset.key as keyof RedactSettings;
      const name = cb.dataset.name!;
      const arr = settings[key] as string[];
      if (cb.checked) {
        if (!arr.includes(name)) arr.push(name);
      } else {
        const idx = arr.indexOf(name);
        if (idx >= 0) arr.splice(idx, 1);
      }
      // Update visual state
      const label = cb.closest('.settings-item') as HTMLElement;
      const cat = categories.find(c => c.key === key)!;
      if (cb.checked) {
        label.classList.add('settings-item-hidden');
        let repl = label.querySelector('.settings-item-replacement');
        if (!repl) {
          repl = document.createElement('span');
          repl.className = 'settings-item-replacement';
          label.appendChild(repl);
        }
        repl.textContent = cat.replacementLabel;
      } else {
        label.classList.remove('settings-item-hidden');
        label.querySelector('.settings-item-replacement')?.remove();
      }
      updateCounts(container, categories, settings);
    });
  });

  // Hide all / Show all
  container.querySelectorAll<HTMLButtonElement>('button[data-action]').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.key as keyof RedactSettings;
      const action = btn.dataset.action;
      const cat = categories.find(c => c.key === key)!;

      if (action === 'hide-all') {
        (settings[key] as string[]).length = 0;
        (settings[key] as string[]).push(...cat.items);
      } else {
        (settings[key] as string[]).length = 0;
      }

      // Update all checkboxes in this category
      const catEl = container.querySelector(`.settings-category[data-key="${key}"]`);
      catEl?.querySelectorAll<HTMLInputElement>('input[type="checkbox"]').forEach(cb => {
        const isHidden = action === 'hide-all';
        cb.checked = isHidden;
        const label = cb.closest('.settings-item') as HTMLElement;
        if (isHidden) {
          label.classList.add('settings-item-hidden');
          let repl = label.querySelector('.settings-item-replacement');
          if (!repl) {
            repl = document.createElement('span');
            repl.className = 'settings-item-replacement';
            label.appendChild(repl);
          }
          repl.textContent = cat.replacementLabel;
        } else {
          label.classList.remove('settings-item-hidden');
          label.querySelector('.settings-item-replacement')?.remove();
        }
      });
      updateCounts(container, categories, settings);
    });
  });

  // Save
  container.querySelector('#settings-save')?.addEventListener('click', async () => {
    await window.orbit.saveRedactSettings(settings);
    updateRedactSettings(settings);
    const btn = container.querySelector('#settings-save') as HTMLElement;
    btn.textContent = 'Saved!';
    setTimeout(() => { btn.textContent = 'Save Changes'; }, 1500);
  });

  // Reset
  container.querySelector('#settings-reset')?.addEventListener('click', async () => {
    settings.hiddenWorkspaces = [];
    settings.hiddenMcpServers = [];
    settings.hiddenSkills = [];
    settings.hiddenAgentModes = [];
    await window.orbit.saveRedactSettings(settings);
    updateRedactSettings(settings);
    // Re-render
    renderSettings(container);
  });
}

function updateCounts(container: HTMLElement, categories: { key: keyof RedactSettings; label: string; items: string[] }[], settings: RedactSettings): void {
  for (const cat of categories) {
    const countEl = container.querySelector(`.settings-category[data-key="${cat.key}"] .settings-category-count`);
    if (countEl) countEl.textContent = `${(settings[cat.key] as string[]).length} / ${cat.items.length} hidden`;
  }
  const total = settings.hiddenWorkspaces.length + settings.hiddenMcpServers.length +
    settings.hiddenSkills.length + settings.hiddenAgentModes.length;
  const countVal = container.querySelector('#settings-hidden-count');
  if (countVal) countVal.textContent = String(total);
}
