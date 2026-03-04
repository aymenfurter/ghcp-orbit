import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import { Worker } from 'worker_threads';
import { parseAllLogs, ParseResult } from './parser';
import { Analyzer } from './analyzer';
import { runAllAgentChecks, stopAgent } from './agent';
import { IPC, BurndownConfig, Session, RedactSettings } from './types';

// Prevent crash when parent terminal disconnects (write EIO on stdout/stderr)
for (const stream of [process.stdout, process.stderr]) {
  stream?.on?.('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EIO') return;
    throw err;
  });
}

let win: BrowserWindow | null = null;
let analyzer: Analyzer;
let parseResult: ParseResult;
let logsDirs: string[] = [];

function findLogsDirs(): string[] {
  const dirs: string[] = [];
  const home = process.env.HOME || process.env.USERPROFILE || '';

  // VS Code editions: stable and Insiders
  const editionFolders = ['Code', 'Code - Insiders'];

  for (const edition of editionFolders) {
    let vsPath;
    if (process.platform === 'darwin') {
      vsPath = path.join(home, 'Library', 'Application Support', edition, 'User', 'workspaceStorage');
    } else if (process.platform === 'win32') {
      vsPath = path.join(process.env.APPDATA || '', edition, 'User', 'workspaceStorage');
    } else {
      // Linux: Code → ~/.config/Code, Code - Insiders → ~/.config/Code - Insiders
      vsPath = path.join(home, '.config', edition, 'User', 'workspaceStorage');
    }
    if (vsPath && fs.existsSync(vsPath) && !dirs.includes(vsPath)) dirs.push(vsPath);
  }

  return dirs;
}

/* ---- Redact settings ---- */

function getRedactPath(): string {
  return path.join(app.getPath('userData'), 'redact-settings.json');
}

function loadRedactSettings(): RedactSettings {
  try {
    const raw = fs.readFileSync(getRedactPath(), 'utf-8');
    return JSON.parse(raw);
  } catch {
    return { hiddenWorkspaces: [], hiddenMcpServers: [], hiddenSkills: [], hiddenAgentModes: [] };
  }
}

function saveRedactSettings(settings: RedactSettings): void {
  fs.writeFileSync(getRedactPath(), JSON.stringify(settings, null, 2), 'utf-8');
}

/* ---- Session cache ---- */

// Bump this version whenever the session schema changes to invalidate old caches
const CACHE_VERSION = 'v5';

function getCachePath(): string {
  return path.join(app.getPath('userData'), 'session-cache.json');
}

function computeFingerprint(dirs: string[]): string {
  const hash = crypto.createHash('sha256');
  hash.update(CACHE_VERSION);
  for (const dir of dirs.slice().sort()) {
    hash.update(dir);
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true })
        .filter(e => e.isDirectory())
        .map(e => e.name)
        .sort();
      hash.update(String(entries.length));
      for (const name of entries) {
        // Only fingerprint chatSessions / chatEditingSessions dirs, not the
        // workspace folder itself (whose mtime changes whenever VS Code
        // writes state.vscdb or extension data).
        for (const sub of ['chatSessions', 'chatEditingSessions']) {
          const subPath = path.join(dir, name, sub);
          try {
            const stat = fs.statSync(subPath);
            hash.update(sub + String(Math.floor(stat.mtimeMs)));
          } catch { /* sub-dir doesn't exist */ }
        }
      }
    } catch { /* skip */ }
  }
  return hash.digest('hex');
}

interface CacheData {
  fingerprint: string;
  sessions: Session[];
  editLocPlain: Record<string, Record<string, number>>;
}

function loadCache(fingerprint: string): CacheData | null {
  try {
    const raw = fs.readFileSync(getCachePath(), 'utf-8');
    const cache: CacheData = JSON.parse(raw);
    if (cache.fingerprint === fingerprint) return cache;
  } catch { /* no cache or corrupt */ }
  return null;
}

function saveCache(fingerprint: string, sessions: Session[], editLocIndex: Map<string, Map<string, number>>) {
  const editLocPlain: Record<string, Record<string, number>> = {};
  for (const [reqId, fileMap] of editLocIndex) {
    editLocPlain[reqId] = Object.fromEntries(fileMap);
  }
  const cache: CacheData = { fingerprint, sessions, editLocPlain };
  try {
    fs.writeFileSync(getCachePath(), JSON.stringify(cache), 'utf-8');
  } catch (err) {
    console.warn('Orbit: failed to write cache:', (err as Error).message);
  }
}

function applyCache(cache: CacheData): number {
  const editLocIndex = new Map<string, Map<string, number>>();
  for (const [reqId, files] of Object.entries(cache.editLocPlain)) {
    editLocIndex.set(reqId, new Map(Object.entries(files)));
  }
  parseResult = { workspaces: new Map(), sessions: cache.sessions, editLocIndex };
  analyzer = new Analyzer(parseResult.sessions, editLocIndex);
  return parseResult.sessions.length;
}

function loadDataSync() {
  if (!logsDirs.length) logsDirs = findLogsDirs();
  const fp = computeFingerprint(logsDirs);
  const cached = loadCache(fp);
  if (cached) {
    console.log(`Orbit: loaded ${cached.sessions.length} sessions from cache`);
    return applyCache(cached);
  }
  parseResult = parseAllLogs(logsDirs);
  analyzer = new Analyzer(parseResult.sessions, parseResult.editLocIndex);
  saveCache(fp, parseResult.sessions, parseResult.editLocIndex);
  return parseResult.sessions.length;
}

function loadDataAsync(): Promise<number> {
  if (!logsDirs.length) logsDirs = findLogsDirs();
  const fp = computeFingerprint(logsDirs);
  const cached = loadCache(fp);
  if (cached) {
    console.log(`Orbit: loaded ${cached.sessions.length} sessions from cache`);
    const count = applyCache(cached);
    win?.webContents.send('parse-progress', { done: 1, total: 1, sessions: count, label: 'Loaded from cache' });
    return Promise.resolve(count);
  }

  return new Promise((resolve, _reject) => {
    const workerPath = path.join(__dirname, 'parse-worker.js');
    const worker = new Worker(workerPath, { workerData: { dirs: logsDirs } });
    worker.on('message', (msg: any) => {
      if (msg.type === 'progress') {
        win?.webContents.send('parse-progress', {
          done: msg.done, total: msg.total, sessions: msg.sessions, label: msg.label,
        });
        return;
      }
      // type === 'done'
      const editLocIndex = new Map<string, Map<string, number>>();
      for (const [reqId, files] of Object.entries(msg.editLocPlain as Record<string, Record<string, number>>)) {
        editLocIndex.set(reqId, new Map(Object.entries(files)));
      }
      parseResult = { workspaces: new Map(), sessions: msg.sessions, editLocIndex };
      analyzer = new Analyzer(parseResult.sessions, editLocIndex);
      saveCache(fp, parseResult.sessions, editLocIndex);
      console.log(`Orbit: ${parseResult.sessions.length} sessions from ${logsDirs.length} dirs (cached)`);
      resolve(parseResult.sessions.length);
    });
    worker.on('error', (err) => {
      console.error('Worker failed, falling back to sync:', err.message);
      resolve(loadDataSync());
    });
  });
}

function getIconPath(): string {
  // In packaged app, assets are in resources/assets/; in dev, they're in assets/
  const devIcon = path.join(__dirname, '..', '..', 'assets', process.platform === 'darwin' ? 'icon.icns' : 'icon.png');
  const prodIcon = path.join(process.resourcesPath || '', 'assets', process.platform === 'darwin' ? 'icon.icns' : 'icon.png');
  return fs.existsSync(prodIcon) ? prodIcon : devIcon;
}

function createWindow() {
  win = new BrowserWindow({
    width: 1400, height: 1089, minWidth: 1000, minHeight: 847,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    backgroundColor: '#0d1117',
    icon: getIconPath(),
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Smooth launch: show window only when ready to prevent white flash
  win.once('ready-to-show', () => {
    win?.show();
  });

  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  if (process.argv.includes('--dev')) win.webContents.openDevTools();
}

function registerIPC() {
  // Data endpoints — each wraps a try/catch so renderer never gets unhandled errors
  const safe = (fn: (...args: any[]) => any) => async (_: any, ...args: any[]) => {
    try { return fn(...args); }
    catch (e: any) { console.error('IPC error:', e?.message); return null; }
  };

  ipcMain.handle(IPC.GET_DAILY_ACTIVITY, safe((f) => analyzer.getDailyActivity(f || {})));
  ipcMain.handle(IPC.GET_HOURLY_DISTRIBUTION, safe((f) => analyzer.getHourlyDistribution(f || {})));
  ipcMain.handle(IPC.GET_HEATMAP, safe((f) => analyzer.getHeatmap(f || {})));
  ipcMain.handle(IPC.GET_WORKSPACE_BREAKDOWN, safe((f) => analyzer.getWorkspaceBreakdown(f || {})));
  ipcMain.handle(IPC.GET_CODE_PRODUCTION, safe((f) => analyzer.getCodeProduction(f || {})));
  ipcMain.handle(IPC.GET_CONSUMPTION, safe((f) => analyzer.getConsumption(f || {})));
  ipcMain.handle(IPC.GET_DAY_TIMELINE, safe((date, mode, ws, end) =>
    analyzer.getDayTimeline(date, mode || 'day', ws, end)));
  ipcMain.handle(IPC.GET_JOURNEY, safe((ws) => analyzer.getJourney(ws || '')));
  ipcMain.handle(IPC.GET_SESSIONS, safe((f, page, size) =>
    analyzer.getSessions(f || {}, page || 1, size || 50)));
  ipcMain.handle(IPC.GET_SESSION_DETAIL, safe((id) => analyzer.getSessionDetail(id)));
  ipcMain.handle(IPC.GET_WORKSPACES, safe(() => analyzer.getWorkspaces()));
  ipcMain.handle(IPC.GET_WORKSPACES_WITH_COST, safe(() => analyzer.getWorkspacesWithCost()));
  ipcMain.handle(IPC.GET_BURNDOWN, safe((cfg: BurndownConfig) => analyzer.getBurndown(cfg)));
  ipcMain.handle(IPC.GET_RECOMMENDATIONS, safe((ws) => analyzer.getRecommendations(ws || '')));
  ipcMain.handle(IPC.GET_TIMELINE_ACTIVITY, safe((ws) => analyzer.getTimelineActivity(ws)));
  ipcMain.handle(IPC.GET_TOOLING, safe((f) => analyzer.getTooling(f || {})));
  ipcMain.handle(IPC.GET_AUTONOMY, safe((f) => analyzer.getAutonomy(f || {})));
  ipcMain.handle(IPC.GET_ANTI_PATTERNS, safe((f) => analyzer.getAntiPatterns(f || {})));
  ipcMain.handle(IPC.GET_LOGS_DIRS, safe(() => logsDirs));

  // Agentic results persistence
  ipcMain.handle('save-agent-results', safe((data: any) => {
    const cachePath = path.join(app.getPath('userData'), 'agent-results.json');
    fs.writeFileSync(cachePath, JSON.stringify(data), 'utf-8');
    return true;
  }));

  ipcMain.handle('load-agent-results', safe(() => {
    const cachePath = path.join(app.getPath('userData'), 'agent-results.json');
    try {
      const raw = fs.readFileSync(cachePath, 'utf-8');
      return JSON.parse(raw);
    } catch { return null; }
  }));

  // Agent analysis — runs all checks via a single Copilot SDK session
  ipcMain.handle('get-agent-analysis', async (_ev, workspace?: string, model?: string) => {
    const showAll = !workspace || workspace.toLowerCase() === 'all';
    const scopedSessions = showAll ? parseResult.sessions : parseResult.sessions.filter(s => s.workspaceName === workspace);
    try {
      const checks = await runAllAgentChecks(scopedSessions, analyzer, (event) => {
        win?.webContents.send('agent-progress', event);
      }, model || 'gpt-5-mini');
      return { checks };
    } catch (err: any) {
      win?.webContents.send('agent-progress', { type: 'error', message: err?.message || 'Agent analysis failed' });
      return { checks: [], error: err?.message || 'Agent analysis failed' };
    }
  });

  ipcMain.handle(IPC.RELOAD_DATA, async () => {
    try {
      const count = await loadDataAsync();
      return { sessions: count };
    } catch (e: any) {
      console.error('Reload error:', e?.message);
      return null;
    }
  });

  ipcMain.handle(IPC.SELECT_LOGS_DIR, async () => {
    const result = await dialog.showOpenDialog(win!, {
      properties: ['openDirectory', 'multiSelections'],
      title: 'Select Copilot Logs Directories',
    });
    if (!result.canceled && result.filePaths.length) {
      logsDirs = result.filePaths;
      const count = await loadDataAsync();
      return { dirs: logsDirs, sessions: count };
    }
    return null;
  });

  // Redact settings
  ipcMain.handle(IPC.GET_REDACT_SETTINGS, safe(() => loadRedactSettings()));
  ipcMain.handle(IPC.SAVE_REDACT_SETTINGS, safe((settings: RedactSettings) => {
    saveRedactSettings(settings);
    return true;
  }));
  ipcMain.handle(IPC.GET_AVAILABLE_ITEMS, safe(() => {
    const workspaces = analyzer.getWorkspaces();
    const tooling = analyzer.getTooling({});
    return {
      workspaces,
      mcpServers: (tooling.mcpServers || []).map((s: any) => s.name),
      skills: (tooling.skills || []).map((s: any) => s.name),
      agentModes: (tooling.agentModes || []).map((m: any) => m.label),
    };
  }));
}

app.setName('Orbit');
if (process.platform === 'darwin') {
  app.setAboutPanelOptions({
    applicationName: 'Orbit',
    applicationVersion: app.getVersion(),
    version: '',
    copyright: 'Development Intelligence Dashboard',
    iconPath: getIconPath(),
  });
}

app.whenReady().then(() => {
  createWindow();
  registerIPC();

  // Wait for the renderer to finish loading, then parse in a worker thread
  win!.webContents.on('did-finish-load', () => {
    setTimeout(async () => {
      const count = await loadDataAsync();
      win?.webContents.send('data-ready', { sessions: count, dirs: logsDirs });
    }, 200);
  });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('before-quit', () => { stopAgent().catch(() => {}); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
