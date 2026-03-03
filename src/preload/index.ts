import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('orbit', {
  getDailyActivity: (f?: any) => ipcRenderer.invoke('get-daily-activity', f),
  getHourlyDistribution: (f?: any) => ipcRenderer.invoke('get-hourly-distribution', f),
  getHeatmap: (f?: any) => ipcRenderer.invoke('get-heatmap', f),
  getWorkspaceBreakdown: (f?: any) => ipcRenderer.invoke('get-workspace-breakdown', f),
  getCodeProduction: (f?: any) => ipcRenderer.invoke('get-code-production', f),
  getConsumption: (f?: any) => ipcRenderer.invoke('get-consumption', f),
  getDayTimeline: (date: string, mode?: string, ws?: string, end?: string) =>
    ipcRenderer.invoke('get-day-timeline', date, mode, ws, end),
  getJourney: (ws?: string) => ipcRenderer.invoke('get-journey', ws),
  getSessions: (f?: any, page?: number, size?: number) =>
    ipcRenderer.invoke('get-sessions', f, page, size),
  getSessionDetail: (id: string) => ipcRenderer.invoke('get-session-detail', id),
  getWorkspaces: () => ipcRenderer.invoke('get-workspaces'),
  getWorkspacesWithCost: () => ipcRenderer.invoke('get-workspaces-with-cost'),
  getBurndown: (cfg: any) => ipcRenderer.invoke('get-burndown', cfg),
  getRecommendations: (ws?: string) => ipcRenderer.invoke('get-recommendations', ws),
  getAgentAnalysis: (ws?: string, model?: string) => ipcRenderer.invoke('get-agent-analysis', ws, model),
  getTimelineActivity: (ws?: string) => ipcRenderer.invoke('get-timeline-activity', ws),
  getTooling: (f?: any) => ipcRenderer.invoke('get-tooling', f),
  reloadData: () => ipcRenderer.invoke('reload-data'),
  selectLogsDir: () => ipcRenderer.invoke('select-logs-dir'),
  getLogsDirs: () => ipcRenderer.invoke('get-logs-dirs'),
  onDataReady: (cb: (data: any) => void) => ipcRenderer.on('data-ready', (_, data) => cb(data)),
  onParseProgress: (cb: (data: any) => void) => ipcRenderer.on('parse-progress', (_, data) => cb(data)),
  saveAgentResults: (data: any) => ipcRenderer.invoke('save-agent-results', data),
  loadAgentResults: () => ipcRenderer.invoke('load-agent-results'),
  onAgentProgress: (cb: (event: any) => void) => ipcRenderer.on('agent-progress', (_, event) => cb(event)),
  getRedactSettings: () => ipcRenderer.invoke('get-redact-settings'),
  saveRedactSettings: (settings: any) => ipcRenderer.invoke('save-redact-settings', settings),
  getAvailableItems: () => ipcRenderer.invoke('get-available-items'),
});
