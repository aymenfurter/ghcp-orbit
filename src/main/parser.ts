/* Log file parser - reads VS Code Copilot Chat log directories */

import * as fs from 'fs';
import * as path from 'path';
import { Session, SessionRequest, CodeBlock, Workspace, ToolConfirmation } from './types';

const CODE_BLOCK_RE = /```(\w+)?\n([\s\S]*?)```/g;

const LANG_ALIASES: Record<string, string> = {
  sh: 'bash', shell: 'bash', zsh: 'bash',
  ts: 'typescript', tsx: 'typescript',
  js: 'javascript', jsx: 'javascript',
  py: 'python', python3: 'python',
  cs: 'csharp', 'c#': 'csharp',
  yml: 'yaml', md: 'markdown',
  tf: 'terraform', rs: 'rust', rb: 'ruby',
  jsonc: 'json', jsonl: 'json',
  txt: 'text', plaintext: 'text', env: 'dotenv',
};

const EXT_TO_TECH: Record<string, string> = {
  py: 'Python', pyx: 'Python', pyi: 'Python',
  js: 'JavaScript', mjs: 'JavaScript', cjs: 'JavaScript',
  ts: 'TypeScript', tsx: 'TypeScript', jsx: 'React',
  java: 'Java', cs: 'C#', csx: 'C#',
  go: 'Go', rs: 'Rust', rb: 'Ruby', php: 'PHP',
  swift: 'Swift', kt: 'Kotlin', kts: 'Kotlin', scala: 'Scala',
  c: 'C', h: 'C', cpp: 'C++', cc: 'C++', cxx: 'C++', hpp: 'C++',
  html: 'HTML', htm: 'HTML',
  css: 'CSS', scss: 'CSS', sass: 'CSS', less: 'CSS',
  json: 'JSON', jsonc: 'JSON', jsonl: 'JSON',
  yaml: 'YAML', yml: 'YAML', toml: 'TOML', xml: 'XML',
  sql: 'SQL', sh: 'Shell', bash: 'Shell', zsh: 'Shell',
  ps1: 'PowerShell', psm1: 'PowerShell',
  tf: 'Terraform', tfvars: 'Terraform', bicep: 'Bicep',
  md: 'Markdown', mdx: 'Markdown',
  dockerfile: 'Docker', r: 'R', lua: 'Lua', dart: 'Dart',
  vue: 'Vue', svelte: 'Svelte', ipynb: 'Jupyter',
  proto: 'Protobuf', graphql: 'GraphQL', gql: 'GraphQL',
  python: 'Python', javascript: 'JavaScript', typescript: 'TypeScript',
  csharp: 'C#', rust: 'Rust', ruby: 'Ruby',
  terraform: 'Terraform', text: 'Text', dotenv: 'Dotenv',
  mermaid: 'Mermaid', tex: 'LaTeX', latex: 'LaTeX',
  properties: 'Properties', ini: 'INI',
  gitignore: 'Git Config', ignore: 'Git Config', dockerignore: 'Docker',
  powershell: 'PowerShell', hcl: 'Terraform',
  log: 'Log', diff: 'Diff', csv: 'CSV', svg: 'XML',
  console: 'Shell', azurecli: 'Shell', dotnetcli: 'Shell',
  makefile: 'Make', bicepparam: 'Bicep',
  clojure: 'Clojure', dot: 'GraphViz', http: 'HTTP',
};

export function techFromPath(filePath: string): string {
  const name = filePath.replace(/\\/g, '/').split('/').pop()!.toLowerCase();
  if (name === 'dockerfile' || name.startsWith('dockerfile.')) return 'Docker';
  if (name === 'makefile' || name === 'gnumakefile') return 'Make';
  if (name === 'cmakelists.txt') return 'CMake';
  const ext = name.includes('.') ? name.split('.').pop()! : '';
  return EXT_TO_TECH[ext] || '';
}

function extractCodeBlocks(text: string): CodeBlock[] {
  const blocks: CodeBlock[] = [];
  let m: RegExpExecArray | null;
  const re = new RegExp(CODE_BLOCK_RE.source, 'g');
  while ((m = re.exec(text)) !== null) {
    let lang = (m[1] || 'unknown').toLowerCase().trim();
    lang = LANG_ALIASES[lang] || lang;
    const code = m[2].trim();
    const loc = code ? code.split('\n').length : 0;
    blocks.push({ language: lang, loc });
  }
  return blocks;
}

function setAtPath(obj: any, keys: any[], value: any): void {
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    if (typeof key === 'number') {
      while (obj.length <= key) obj.push(null);
      if (obj[key] === null) obj[key] = {};
      obj = obj[key];
    } else {
      if (!(key in obj)) obj[key] = {};
      obj = obj[key];
    }
  }
  const last = keys[keys.length - 1];
  if (Array.isArray(obj)) {
    while (obj.length <= last) obj.push(null);
    obj[last] = value;
  } else {
    obj[last] = value;
  }
}

function appendAtPath(obj: any, keys: any[], items: any): void {
  let target = obj;
  for (const key of keys) {
    if (typeof key === 'number') {
      target = target[key];
    } else {
      if (!(key in target)) target[key] = [];
      target = target[key];
    }
  }
  if (Array.isArray(target) && Array.isArray(items)) {
    target.push(...items);
  }
}

function reconstructFromJsonl(fpath: string): Record<string, any> | null {
  let state: Record<string, any> = {};
  try {
    const lines = fs.readFileSync(fpath, 'utf-8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const entry = JSON.parse(trimmed);
      const kind = entry.kind;
      if (kind === 0) {
        state = entry.v || {};
      } else if (kind === 1) {
        setAtPath(state, entry.k || [], entry.v);
      } else if (kind === 2) {
        appendAtPath(state, entry.k || [], entry.v);
      }
    }
  } catch {
    return null;
  }
  return Object.keys(state).length > 0 ? state : null;
}

function parseWorkspaceName(wsJsonPath: string): string {
  try {
    const data = JSON.parse(fs.readFileSync(wsJsonPath, 'utf-8'));
    const raw: string = data.folder || data.workspace || '';
    const decoded = decodeURIComponent(raw.replace('file://', ''));
    return decoded.replace(/\/+$/, '').split('/').pop() || 'unknown';
  } catch {
    return 'unknown';
  }
}

export function shortPath(fullPath: string, workspaceName: string): string {
  const parts = fullPath.replace(/\\/g, '/').split('/');
  for (let i = 0; i < parts.length; i++) {
    if (parts[i] === workspaceName) {
      return parts.slice(i + 1).join('/');
    }
  }
  return parts.length > 3 ? parts.slice(-3).join('/') : fullPath;
}

export interface ParseResult {
  workspaces: Map<string, Workspace>;
  sessions: Session[];
  editLocIndex: Map<string, Map<string, number>>;
}

export type ProgressCallback = (done: number, total: number, sessions: number, label: string) => void;

export function parseAllLogs(logsDirs: string[], onProgress?: ProgressCallback): ParseResult {
  const workspaces = new Map<string, Workspace>();
  const sessions: Session[] = [];
  const editLocIndex = new Map<string, Map<string, number>>();

  // Count total workspace dirs for progress reporting
  let totalDirs = 0;
  const allEntries: { logsDir: string; entries: fs.Dirent[] }[] = [];
  for (const logsDir of logsDirs) {
    try {
      const entries = fs.readdirSync(logsDir, { withFileTypes: true });
      const dirs = entries.filter(e => e.isDirectory());
      totalDirs += dirs.length;
      allEntries.push({ logsDir, entries: dirs });
    } catch { continue; }
  }

  let processed = 0;
  for (const { logsDir, entries: dirEntries } of allEntries) {
    for (const dirEnt of dirEntries) {
      const wsId = dirEnt.name;
      const entryPath = path.join(logsDir, wsId);

      const wsJsonPath = path.join(entryPath, 'workspace.json');
      const wsName = fs.existsSync(wsJsonPath) ? parseWorkspaceName(wsJsonPath) : wsId;
      workspaces.set(wsId, { id: wsId, name: wsName, path: entryPath });

      // Parse chat sessions
      const chatDir = path.join(entryPath, 'chatSessions');
      try {
        const chatFiles = fs.readdirSync(chatDir, { withFileTypes: true });
        for (const cf of chatFiles) {
          if (!cf.isFile() || (!cf.name.endsWith('.json') && !cf.name.endsWith('.jsonl'))) continue;
          const sessionFile = path.join(chatDir, cf.name);
          const session = parseSessionFile(sessionFile, wsId, wsName);
          if (session) sessions.push(session);
        }
      } catch { /* chatSessions dir doesn't exist */ }

      // Parse edit sessions (merged — no second traversal)
      const esDir = path.join(entryPath, 'chatEditingSessions');
      try {
        const esEntries = fs.readdirSync(esDir, { withFileTypes: true });
        for (const esEnt of esEntries) {
          if (!esEnt.isDirectory()) continue;
          const stateFile = path.join(esDir, esEnt.name, 'state.json');
          let raw: string;
          try { raw = fs.readFileSync(stateFile, 'utf-8'); } catch { continue; }
          if (!raw.includes('"textEdit"')) continue;
          let state: any;
          try { state = JSON.parse(raw); } catch { continue; }
          for (const op of (state.timeline?.operations || [])) {
            if (op.type !== 'textEdit') continue;
            const reqId: string = op.requestId || '';
            const uri: string = op.uri?.external || '';
            if (!reqId || !uri) continue;
            if (!editLocIndex.has(reqId)) editLocIndex.set(reqId, new Map());
            const fileMap = editLocIndex.get(reqId)!;
            let linesAdded = 0;
            for (const edit of (op.edits || [])) {
              const text: string = edit.text || '';
              if (text) linesAdded += (text.match(/\n/g) || []).length;
            }
            fileMap.set(uri, (fileMap.get(uri) || 0) + linesAdded);
          }
        }
      } catch { /* chatEditingSessions dir doesn't exist */ }

      processed++;
      if (onProgress && (processed % 10 === 0 || processed === totalDirs)) {
        onProgress(processed, totalDirs, sessions.length, wsName);
      }
    }
  }

  return { workspaces, sessions, editLocIndex };
}

function parseSessionFile(sessionFile: string, wsId: string, wsName: string): Session | null {
  let data: Record<string, any>;
  try {
    if (sessionFile.endsWith('.jsonl')) {
      const result = reconstructFromJsonl(sessionFile);
      if (!result) return null;
      data = result;
    } else {
      data = JSON.parse(fs.readFileSync(sessionFile, 'utf-8'));
    }
  } catch { return null; }

  const creationTs: number | null = data.creationDate ?? null;
  let lastMsgTs: number | null = data.lastMessageDate ?? null;
  const requests = (data.requests || []) as any[];

  if (lastMsgTs == null && requests.length > 0) {
    lastMsgTs = requests[requests.length - 1].timestamp ?? creationTs;
  }

  const sessionInfo: Session = {
    sessionId: data.sessionId || path.basename(sessionFile, path.extname(sessionFile)),
    workspaceId: wsId,
    workspaceName: wsName,
    location: data.initialLocation || 'panel',
    creationDate: creationTs,
    lastMessageDate: lastMsgTs,
    requestCount: requests.length,
    requests: [],
  };

  for (const req of requests) {
    let msgText = '';
    const msg = req.message;
    if (msg && typeof msg === 'object') msgText = msg.text || '';

    let respText = '';
    const resp = req.response;
    if (Array.isArray(resp)) {
      const parts: string[] = [];
      for (const part of resp) {
        if (part && typeof part === 'object' && 'value' in part) parts.push(String(part.value));
      }
      respText = parts.join('\n');
    }

    const result = req.result || {};
    const timings = (typeof result === 'object' ? result.timings : null) || {};
    const agentInfo = req.agent || {};
    const agentName = typeof agentInfo === 'object'
      ? (agentInfo.extensionDisplayName || agentInfo.id || '') : '';
    const agentMode = typeof agentInfo === 'object'
      ? (agentInfo.id || '') : '';
    const userCode = extractCodeBlocks(msgText);
    const aiCode = extractCodeBlocks(respText);
    const modelId: string = req.modelId || '';

    // Slash command
    const slashCmdObj = req.slashCommand || {};
    const slashCommand = (typeof slashCmdObj === 'object' && slashCmdObj.name) ? slashCmdObj.name : '';

    // Variable data (used for variable kinds + referenced files)
    const vd = req.variableData || {};

    // Variable kinds
    const variableKinds: Record<string, number> = {};
    const vdVars = (typeof vd === 'object' ? vd.variables : []) || [];
    for (const v of vdVars) {
      if (typeof v === 'object' && v && v.kind) {
        variableKinds[v.kind] = (variableKinds[v.kind] || 0) + 1;
      }
    }

    // Custom instructions / prompt files from content references
    const customInstructions: string[] = [];
    for (const cr of (req.contentReferences || [])) {
      if (typeof cr !== 'object' || !cr) continue;
      const ref = cr.reference;
      if (typeof ref !== 'object' || !ref) continue;
      const ext = (ref.external || ref.fsPath || '') as string;
      const lower = ext.toLowerCase();
      if (lower.includes('.instructions.md') || lower.includes('copilot-instructions') || lower.includes('.prompt.md') || lower.includes('agents.md')) {
        const parts = ext.split('/');
        const fname = parts[parts.length - 1] || ext;
        if (fname && !customInstructions.includes(fname)) customInstructions.push(fname);
      }
    }

    // Extract skills from variable data values
    const skillsUsed: string[] = [];
    const skillRe = /<skill>\s*<name>(.*?)<\/name>/g;
    for (const v of vdVars) {
      if (typeof v === 'object' && v && typeof v.value === 'string' && v.value.includes('<skill>')) {
        let sm: RegExpExecArray | null;
        while ((sm = skillRe.exec(v.value)) !== null) {
          const sn = sm[1].trim();
          if (sn && !skillsUsed.includes(sn) && !sn.includes('ai_toolkit')) skillsUsed.push(sn);
        }
        skillRe.lastIndex = 0;
      }
    }

    // Extract tools used
    const toolsUsed: string[] = [];
    const resultMeta = (typeof result === 'object' ? result.metadata : null) || {};
    if (typeof resultMeta === 'object') {
      for (const key of ['toolCallResults', 'toolCallRounds']) {
        const arr = resultMeta[key];
        if (!Array.isArray(arr)) continue;
        for (const tcr of arr) {
          if (typeof tcr !== 'object' || !tcr) continue;
          let tcData = tcr.toolCalls || [];
          if (typeof tcData === 'string') {
            try { tcData = JSON.parse(tcData); } catch { tcData = []; }
          }
          if (Array.isArray(tcData)) {
            for (const tc of tcData) {
              if (tc && typeof tc === 'object' && tc.name) toolsUsed.push(tc.name);
            }
          }
        }
      }
    }

    // Edited files
    const editedFiles: string[] = [];
    for (const efe of (req.editedFileEvents || [])) {
      if (typeof efe === 'object' && efe) {
        const uri = efe.uri || {};
        if (typeof uri === 'object' && uri.path) editedFiles.push(uri.path);
      }
    }

    // Referenced files (using vd already declared above)
    const referencedFiles: string[] = [];
    if (typeof vd === 'object') {
      for (const v of (vd.variables || [])) {
        if (typeof v === 'object' && v && (v.kind === 'file' || v.kind === 'directory')) {
          const val = v.value || {};
          if (typeof val === 'object' && val.path) referencedFiles.push(val.path);
        }
      }
    }

    // Extract tool confirmations from response array (toolInvocationSerialized entries)
    const toolConfirmations: ToolConfirmation[] = [];
    if (Array.isArray(resp)) {
      for (const part of resp) {
        if (part && typeof part === 'object' && part.kind === 'toolInvocationSerialized' && part.isConfirmed) {
          const tsd = part.toolSpecificData;
          const isTerminal = tsd?.kind === 'terminal';
          toolConfirmations.push({
            toolId: part.toolId || '',
            confirmationType: part.isConfirmed.type ?? 0,
            autoApproveScope: part.isConfirmed.scope,
            isTerminal,
            commandLine: isTerminal ? (tsd?.confirmation?.commandLine || tsd?.commandLine?.original) : undefined,
          });
        }
      }
    }

    sessionInfo.requests.push({
      requestId: req.requestId || '',
      timestamp: req.timestamp ?? null,
      messageText: msgText,
      responseText: respText,
      isCanceled: req.isCanceled || false,
      agentName, agentMode, modelId, toolsUsed, editedFiles, referencedFiles,
      slashCommand, variableKinds, customInstructions, skillsUsed,
      firstProgress: timings.firstProgress ?? null,
      totalElapsed: timings.totalElapsed ?? null,
      messageLength: msgText.length,
      responseLength: respText.length,
      userCode, aiCode, toolConfirmations,
    });
  }

  return sessionInfo;
}
