/* Redact utility — hides specific items from UI display for presentation purposes */

export interface RedactSettings {
  hiddenWorkspaces: string[];
  hiddenMcpServers: string[];
  hiddenSkills: string[];
  hiddenAgentModes: string[];
}

let _settings: RedactSettings = {
  hiddenWorkspaces: [],
  hiddenMcpServers: [],
  hiddenSkills: [],
  hiddenAgentModes: [],
};

let _loaded = false;

export async function loadRedactSettings(): Promise<RedactSettings> {
  if (!_loaded) {
    _settings = await window.orbit.getRedactSettings() || _settings;
    _loaded = true;
  }
  return _settings;
}

export function getRedactSettings(): RedactSettings {
  return _settings;
}

export function updateRedactSettings(s: RedactSettings): void {
  _settings = s;
}

/** Returns true if the item should be hidden (redacted) */
export function isHidden(category: keyof RedactSettings, name: string): boolean {
  return _settings[category].includes(name);
}

/** Counter for generating unique replacement labels per category */
const _counters: Record<string, Map<string, number>> = {};

function getRedactIndex(category: string, name: string): number {
  if (!_counters[category]) _counters[category] = new Map();
  const m = _counters[category];
  if (!m.has(name)) m.set(name, m.size + 1);
  return m.get(name)!;
}

const CATEGORY_LABELS: Record<string, string> = {
  hiddenWorkspaces: 'Workspace',
  hiddenMcpServers: 'MCP Server',
  hiddenSkills: 'Skill',
  hiddenAgentModes: 'Mode',
};

/** Replace a name with "Custom X #N" if hidden, otherwise return as-is */
export function redact(category: keyof RedactSettings, name: string): string {
  if (!_settings[category].includes(name)) return name;
  const label = CATEGORY_LABELS[category] || 'Item';
  const idx = getRedactIndex(category, name);
  return `Custom ${label} ${idx}`;
}

/** Reset counters (call on page navigation) */
export function resetRedactCounters(): void {
  for (const k of Object.keys(_counters)) delete _counters[k];
}

/** Check if any items are hidden at all */
export function hasRedactions(): boolean {
  return _settings.hiddenWorkspaces.length > 0 ||
    _settings.hiddenMcpServers.length > 0 ||
    _settings.hiddenSkills.length > 0 ||
    _settings.hiddenAgentModes.length > 0;
}
