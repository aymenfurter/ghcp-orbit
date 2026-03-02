/* GitHub Copilot SDK agent for AI-powered recommendations */
/* Uses @github/copilot-sdk to run a Copilot CLI agent with tool calls */

import { AgentAnalysisResult, Session } from './types';
import { Analyzer, classifyWorkType, normalizeModelId } from './analyzer';

// Loaded lazily via dynamic import() since @github/copilot-sdk is ESM-only
let _sdk: typeof import('@github/copilot-sdk') | null = null;
let _z: typeof import('zod') | null = null;

async function loadSDK() {
  if (!_sdk) _sdk = await import('@github/copilot-sdk');
  if (!_z) _z = await import('zod');
  return { sdk: _sdk, z: _z.z };
}

export interface AgentCheckDefinition {
  id: string;
  name: string;
  category: string;
  description: string;
}

const AGENT_CHECKS: AgentCheckDefinition[] = [
  { id: 'ai-multi-agent-delegation', name: 'Multi-Agent Delegation', category: 'workflow', description: 'Checks if the user delegates work to multiple agents in parallel for larger projects, avoiding idle wait time.' },
  { id: 'ai-code-cleanup', name: 'Code Cleanup & Review Habits', category: 'workflow', description: 'Checks if the user asks the AI to review, clean up, or improve existing code, not just write new code.' },
  { id: 'ai-context-enrichment', name: 'Context Enrichment (MCP & Docs)', category: 'context', description: 'Evaluates whether the user enriches context via MCP servers, documentation fetching, or still resorts to pasting content.' },
  { id: 'ai-markdown-spec-driven', name: 'Markdown & Spec-Driven Development', category: 'workflow', description: 'Checks the ratio of markdown to code and whether the user follows spec-driven development practices.' },
  { id: 'ai-model-task-match', name: 'Right Model for Right Task', category: 'model-usage', description: 'Validates that strong models (Opus, GPT-o3, Gemini Pro) are used for complex tasks and lighter models for docs/simple tasks.' },
  { id: 'ai-session-hygiene', name: 'Session Hygiene & Context Management', category: 'context', description: 'Checks if users create new sessions for new tasks instead of relying solely on auto-compaction in long conversations.' },
  { id: 'ai-agent-autonomy', name: 'Agent Autonomy', category: 'efficiency', description: 'Detects sessions where the user did not give enough autonomy to the agent, resulting in manual copy-paste of commands.' },
  { id: 'ai-repeated-patterns', name: 'Task Density & Repeated Prompts', category: 'efficiency', description: 'Identifies repeated simple prompts (e.g. starting servers, running linters) that could be automated with scripts.' },
  { id: 'ai-tool-overload', name: 'MCP Server & Tool Overload', category: 'context', description: 'Detects sessions with too many active MCP servers or tools, which degrades performance and increases latency.' },
  { id: 'ai-outdated-models', name: 'Outdated Model Usage', category: 'model-usage', description: 'Warns about usage of deprecated or old models that should be avoided in favor of newer alternatives.' },
];

export function getAgentChecks(): AgentCheckDefinition[] {
  return AGENT_CHECKS;
}

// -- Data extraction helpers (used by tools) --

function buildModelUsageSummary(sessions: Session[], _analyzer: Analyzer) {
  const last7Days = sessions.filter(s => s.creationDate && Date.now() - s.creationDate < 7 * 86400000);
  const models: Record<string, { requests: number; totalResponseLen: number; canceled: number; aiLoc: number; tasks: string[] }> = {};
  for (const s of last7Days) {
    for (const r of s.requests) {
      const m = normalizeModelId(r.modelId);
      if (!models[m]) models[m] = { requests: 0, totalResponseLen: 0, canceled: 0, aiLoc: 0, tasks: [] };
      models[m].requests++;
      models[m].totalResponseLen += r.responseLength;
      if (r.isCanceled) models[m].canceled++;
      models[m].aiLoc += r.aiCode.reduce((a, c) => a + c.loc, 0);
      models[m].tasks.push(classifyWorkType(r.messageText, r.responseText));
    }
  }
  return models;
}

function buildPromptQualityData(sessions: Session[]) {
  return sessions
    .filter(s => s.creationDate && Date.now() - s.creationDate < 7 * 86400000)
    .flatMap(s => s.requests.map(r => ({
      prompt: r.messageText.slice(0, 200),
      promptLength: r.messageLength,
      hasFileRefs: r.referencedFiles.length > 0,
      hasEdits: r.editedFiles.length > 0,
      toolCount: r.toolsUsed.length,
      responseLength: r.responseLength,
      canceled: r.isCanceled,
      model: normalizeModelId(r.modelId),
    })))
    .slice(0, 60);
}

function buildSessionPatterns(sessions: Session[]) {
  return sessions
    .filter(s => s.creationDate && Date.now() - s.creationDate < 14 * 86400000)
    .slice(0, 30)
    .map(s => ({
      workspace: s.workspaceName,
      requestCount: s.requestCount,
      firstPromptLength: s.requests[0]?.messageLength || 0,
      avgPromptLength: Math.round(s.requests.reduce((a, r) => a + r.messageLength, 0) / (s.requestCount || 1)),
      uniqueToolsUsed: [...new Set(s.requests.flatMap(r => r.toolsUsed))],
      uniqueModels: [...new Set(s.requests.map(r => normalizeModelId(r.modelId)))],
      hasPlanning: s.requests[0]?.messageText.toLowerCase().includes('plan') || false,
      cancelRate: s.requestCount > 0 ? Math.round(s.requests.filter(r => r.isCanceled).length / s.requestCount * 100) : 0,
      totalAiLoc: s.requests.reduce((a, r) => a + r.aiCode.reduce((b, c) => b + c.loc, 0), 0),
    }));
}

function buildCodeReviewPatterns(sessions: Session[]) {
  const patterns: { hadCode: boolean; aiLoc: number; nextMsgHasReview: boolean; nextMsgLength: number }[] = [];
  for (const s of sessions.filter(s => s.creationDate && Date.now() - s.creationDate < 14 * 86400000)) {
    for (let i = 0; i < s.requests.length - 1; i++) {
      const curr = s.requests[i];
      const next = s.requests[i + 1];
      const aiLoc = curr.aiCode.reduce((a, c) => a + c.loc, 0);
      if (aiLoc > 0) {
        patterns.push({
          hadCode: true,
          aiLoc,
          nextMsgHasReview: /fix|change|modify|update|wrong|incorrect|adjust|broken|still/i.test(next.messageText),
          nextMsgLength: next.messageLength,
        });
      }
    }
  }
  return patterns.slice(0, 50);
}

function buildHourlyDistribution(sessions: Session[]) {
  const hourBuckets = new Array(24).fill(0);
  let totalRequests = 0;
  const last30 = sessions.filter(s => s.creationDate && Date.now() - s.creationDate < 30 * 86400000);
  for (const s of last30) {
    for (const r of s.requests) {
      if (r.timestamp) {
        hourBuckets[new Date(r.timestamp).getHours()]++;
        totalRequests++;
      }
    }
  }
  const lateNight = hourBuckets.slice(22).reduce((a: number, b: number) => a + b, 0) + hourBuckets.slice(0, 6).reduce((a: number, b: number) => a + b, 0);
  const evening = hourBuckets.slice(18, 22).reduce((a: number, b: number) => a + b, 0);
  return { hourBuckets, totalRequests, lateNight, evening, lateNightPct: totalRequests ? Math.round(lateNight / totalRequests * 100) : 0, eveningPct: totalRequests ? Math.round(evening / totalRequests * 100) : 0 };
}

function buildWeekendPatterns(sessions: Session[]) {
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const weekdayCounts: Record<string, number> = { Mon: 0, Tue: 0, Wed: 0, Thu: 0, Fri: 0, Sat: 0, Sun: 0 };
  const weekendDays = new Set<string>();
  const totalDays = new Set<string>();
  const last60 = sessions.filter(s => s.creationDate && Date.now() - s.creationDate < 60 * 86400000);
  for (const s of last60) {
    if (!s.creationDate) continue;
    const d = new Date(s.creationDate);
    weekdayCounts[dayNames[d.getDay()]] += s.requestCount;
    const dateStr = d.toLocaleDateString('en-CA');
    totalDays.add(dateStr);
    if (d.getDay() === 0 || d.getDay() === 6) weekendDays.add(dateStr);
  }
  return { weekdayCounts, weekendDays: weekendDays.size, totalActiveDays: totalDays.size };
}

function buildSessionDurations(sessions: Session[]) {
  return sessions
    .filter(s => s.creationDate && s.lastMessageDate && Date.now() - s.creationDate < 30 * 86400000)
    .map(s => {
      const durationMin = Math.round((s.lastMessageDate! - s.creationDate!) / 60000);
      const gaps: number[] = [];
      for (let i = 1; i < s.requests.length; i++) {
        if (s.requests[i].timestamp && s.requests[i - 1].timestamp) {
          gaps.push(Math.round((s.requests[i].timestamp! - s.requests[i - 1].timestamp!) / 60000));
        }
      }
      return { durationMin, requestCount: s.requestCount, maxGapMin: gaps.length > 0 ? Math.max(...gaps) : 0 };
    })
    .filter(d => d.durationMin > 0)
    .slice(0, 40);
}

function buildWeeklyIntensity(sessions: Session[]) {
  const weekly = new Map<string, { requests: number; sessions: number; activeDays: Set<string>; lateNightRequests: number }>();
  for (const s of sessions) {
    if (!s.creationDate) continue;
    const d = new Date(s.creationDate);
    const weekStart = new Date(d);
    weekStart.setDate(d.getDate() - d.getDay());
    const weekKey = weekStart.toLocaleDateString('en-CA');
    if (!weekly.has(weekKey)) weekly.set(weekKey, { requests: 0, sessions: 0, activeDays: new Set(), lateNightRequests: 0 });
    const w = weekly.get(weekKey)!;
    w.sessions++;
    w.requests += s.requestCount;
    w.activeDays.add(d.toLocaleDateString('en-CA'));
    for (const r of s.requests) {
      if (r.timestamp) {
        const h = new Date(r.timestamp).getHours();
        if (h >= 22 || h < 6) w.lateNightRequests++;
      }
    }
  }
  return [...weekly.entries()]
    .map(([week, info]) => ({ week, requests: info.requests, sessions: info.sessions, activeDays: info.activeDays.size, lateNightPct: info.requests > 0 ? Math.round(info.lateNightRequests / info.requests * 100) : 0 }))
    .sort((a, b) => a.week.localeCompare(b.week))
    .slice(-12);
}

function buildDailyBoundaries(sessions: Session[]) {
  const dailyBounds = new Map<string, { earliest: number; latest: number }>();
  const last30 = sessions.filter(s => s.creationDate && Date.now() - s.creationDate < 30 * 86400000);
  for (const s of last30) {
    for (const r of s.requests) {
      if (!r.timestamp) continue;
      const d = new Date(r.timestamp);
      const day = d.toLocaleDateString('en-CA');
      const hourDecimal = d.getHours() + d.getMinutes() / 60;
      if (!dailyBounds.has(day)) dailyBounds.set(day, { earliest: hourDecimal, latest: hourDecimal });
      const b = dailyBounds.get(day)!;
      if (hourDecimal < b.earliest) b.earliest = hourDecimal;
      if (hourDecimal > b.latest) b.latest = hourDecimal;
    }
  }
  const days = [...dailyBounds.entries()].map(([day, b]) => ({
    day, startHour: Math.round(b.earliest * 10) / 10, endHour: Math.round(b.latest * 10) / 10, span: Math.round((b.latest - b.earliest) * 10) / 10,
  })).sort((a, b) => a.day.localeCompare(b.day));
  const avgSpan = days.length > 0 ? Math.round(days.reduce((a, d) => a + d.span, 0) / days.length * 10) / 10 : 0;
  const avgStart = days.length > 0 ? Math.round(days.reduce((a, d) => a + d.startHour, 0) / days.length * 10) / 10 : 0;
  const avgEnd = days.length > 0 ? Math.round(days.reduce((a, d) => a + d.endHour, 0) / days.length * 10) / 10 : 0;
  return { days: days.slice(-30), avgSpan, avgStart, avgEnd };
}

function buildMonthlyProgression(sessions: Session[]) {
  const monthly = new Map<string, { tools: Set<string>; models: Set<string>; count: number }>();
  for (const s of sessions) {
    if (!s.creationDate) continue;
    const month = new Date(s.creationDate).toLocaleDateString('en-CA').slice(0, 7);
    if (!monthly.has(month)) monthly.set(month, { tools: new Set(), models: new Set(), count: 0 });
    const m = monthly.get(month)!;
    m.count += s.requestCount;
    for (const r of s.requests) {
      r.toolsUsed.forEach(t => m.tools.add(t));
      if (r.modelId) m.models.add(normalizeModelId(r.modelId));
    }
  }
  return [...monthly.entries()]
    .map(([month, info]) => ({ month, requests: info.count, uniqueTools: info.tools.size, uniqueModels: info.models.size }))
    .sort((a, b) => a.month.localeCompare(b.month));
}

function buildParallelismStats(sessions: Session[]) {
  const daily = new Map<string, { count: number; workspaces: Set<string> }>();
  for (const s of sessions) {
    if (!s.creationDate || !s.lastMessageDate || s.requestCount === 0) continue;
    const day = new Date(s.creationDate).toLocaleDateString('en-CA');
    if (!daily.has(day)) daily.set(day, { count: 0, workspaces: new Set() });
    const d = daily.get(day)!;
    d.count++;
    d.workspaces.add(s.workspaceName);
  }
  return [...daily.entries()].map(([day, info]) => ({ day, sessions: info.count, workspaces: info.workspaces.size })).slice(-30);
}

// -- Progress callback type --

export type AgentProgressEvent =
  | { type: 'status'; message: string }
  | { type: 'tool-call'; tool: string }
  | { type: 'tool-result'; tool: string }
  | { type: 'thinking'; message: string }
  | { type: 'done' }
  | { type: 'error'; message: string };

export type AgentProgressCallback = (event: AgentProgressEvent) => void;

// -- Build tools for a given dataset --

async function buildTools(sessions: Session[], analyzer: Analyzer, onProgress?: AgentProgressCallback) {
  const { sdk: { defineTool }, z } = await loadSDK();

  function trackedTool(name: string, description: string, handler: () => Promise<string>) {
    return defineTool(name, {
      description,
      parameters: z.object({}),
      handler: async () => {
        onProgress?.({ type: 'tool-call', tool: name });
        const result = await handler();
        onProgress?.({ type: 'tool-result', tool: name });
        return result;
      },
    });
  }

  return [
    trackedTool('get_model_usage',
      'Get per-model usage stats from last 7 days: request count, response lengths, canceled count, AI lines of code, and task types.',
      async () => JSON.stringify(buildModelUsageSummary(sessions, analyzer), null, 2)),
    trackedTool('get_prompt_quality_data',
      'Get prompt quality data: prompt text previews, lengths, file references, edits, tool count, response length, cancel status, and model.',
      async () => JSON.stringify(buildPromptQualityData(sessions), null, 2)),
    trackedTool('get_session_patterns',
      'Get workflow patterns per session: workspace, request count, prompt lengths, tools, models, planning usage, cancel rate, and AI LoC.',
      async () => JSON.stringify(buildSessionPatterns(sessions), null, 2)),
    trackedTool('get_code_review_patterns',
      'Get interaction patterns after AI-generated code: whether user iterated/fixed AI output or accepted blindly.',
      async () => JSON.stringify(buildCodeReviewPatterns(sessions), null, 2)),
    trackedTool('get_hourly_distribution',
      'Get hourly request distribution (24h), late-night and evening percentages for work-life balance analysis.',
      async () => JSON.stringify(buildHourlyDistribution(sessions), null, 2)),
    trackedTool('get_weekend_patterns',
      'Get requests by day-of-week and weekend activity for work-life balance analysis.',
      async () => JSON.stringify(buildWeekendPatterns(sessions), null, 2)),
    trackedTool('get_session_durations',
      'Get session durations in minutes, request counts, and max gap between requests for break pattern analysis.',
      async () => JSON.stringify(buildSessionDurations(sessions), null, 2)),
    trackedTool('get_weekly_intensity',
      'Get weekly stats (last 12 weeks): requests, sessions, active days, late-night percentage for burnout risk analysis.',
      async () => JSON.stringify(buildWeeklyIntensity(sessions), null, 2)),
    trackedTool('get_daily_boundaries',
      'Get daily start/end work hours and span for workday boundary consistency analysis.',
      async () => JSON.stringify(buildDailyBoundaries(sessions), null, 2)),
    trackedTool('get_monthly_progression',
      'Get monthly AI tool usage progression: request count, unique tools, unique models for learning curve analysis.',
      async () => JSON.stringify(buildMonthlyProgression(sessions), null, 2)),
    trackedTool('get_parallelism_stats',
      'Get daily session counts and workspace diversity for parallel session effectiveness analysis.',
      async () => JSON.stringify(buildParallelismStats(sessions), null, 2)),
  ];
}

// -- System prompt --

const SYSTEM_PROMPT = `You are Orbit, a development intelligence analyst. You analyze developers' GitHub Copilot usage patterns and provide actionable improvement advice.

You have access to tools that expose session analytics data. Use these tools to gather data, then produce a structured analysis.

You MUST respond with a valid JSON object containing a "checks" array. Each element corresponds to one of the 10 check IDs listed below. For each check, call the appropriate tool(s) to get the data, analyze it, and produce a result.

Check IDs and which tools to use:
- "ai-multi-agent-delegation" -> get_parallelism_stats, get_session_patterns (check if user runs multiple sessions/workspaces in parallel, delegates to multiple agents)
- "ai-code-cleanup" -> get_code_review_patterns (check if user asks AI to review/clean/improve existing code, not just write new code)
- "ai-context-enrichment" -> get_prompt_quality_data, get_session_patterns (check if user enriches context via MCP servers, docs fetching, file references, or just pastes content manually)
- "ai-markdown-spec-driven" -> get_prompt_quality_data, get_session_patterns (check ratio of markdown/spec-driven planning vs jumping straight to code)
- "ai-model-task-match" -> get_model_usage (check if strong models like Opus/GPT-5.1 are used for complex tasks and lighter models like GPT-5-mini/Haiku for simple tasks)
- "ai-session-hygiene" -> get_session_durations, get_session_patterns (check if user creates new sessions for new tasks vs mega-sessions with context drift)
- "ai-agent-autonomy" -> get_prompt_quality_data, get_session_patterns (detect sessions where user does not give agent enough autonomy, copies commands manually instead of letting agent run)
- "ai-repeated-patterns" -> get_prompt_quality_data (identify repeated simple prompts like starting servers or running linters that could be scripted)
- "ai-tool-overload" -> get_session_patterns, get_monthly_progression (detect sessions with too many MCP servers/tools active, causing latency)
- "ai-outdated-models" -> get_model_usage (warn about deprecated/old models that should be replaced with newer alternatives)

Your response MUST be ONLY a JSON object with this exact structure (no markdown, no explanation outside the JSON):
{
  "checks": [
    {
      "checkId": "<check-id>",
      "score": <0-100>,
      "status": "good" | "needs-improvement" | "critical",
      "finding": "<one concise sentence>",
      "recommendation": "<actionable advice>",
      "evidence": ["<point1>", "<point2>"]
    }
  ]
}

Include all 10 checks. Be concise and data-driven.`;

// -- Copilot SDK client lifecycle --

let clientInstance: any = null;

function getNativeCLIPath(): string | undefined {
  const platform = process.platform;
  const arch = process.arch;
  const pkgName = `@github/copilot-${platform}-${arch}`;
  try {
    return require.resolve(pkgName);
  } catch {
    return undefined;
  }
}

async function getClient() {
  if (clientInstance) return clientInstance;
  const { sdk: { CopilotClient } } = await loadSDK();
  const opts: Record<string, any> = { logLevel: 'error' };
  const nativePath = getNativeCLIPath();
  if (nativePath) {
    opts.cliPath = nativePath;
  }
  clientInstance = new CopilotClient(opts);
  await clientInstance.start();
  return clientInstance;
}

export async function stopAgent(): Promise<void> {
  if (clientInstance) {
    await clientInstance.stop().catch(() => {});
    clientInstance = null;
  }
}

// -- Run all agent checks via a single Copilot SDK session --

export async function runAllAgentChecks(
  sessions: Session[],
  analyzer: Analyzer,
  onProgress?: AgentProgressCallback,
  model: string = 'gpt-5-mini',
): Promise<AgentAnalysisResult[]> {
  onProgress?.({ type: 'status', message: 'Connecting to Copilot...' });
  const { sdk: { approveAll } } = await loadSDK();
  const client = await getClient();

  onProgress?.({ type: 'status', message: 'Building analysis tools...' });
  const tools = await buildTools(sessions, analyzer, onProgress);

  onProgress?.({ type: 'status', message: `Creating agent session (model: ${model})...` });
  const session = await client.createSession({
    model,
    tools,
    onPermissionRequest: approveAll,
    systemMessage: { content: SYSTEM_PROMPT },
  });

  try {
    onProgress?.({ type: 'thinking', message: 'Agent is analyzing your data...' });
    const result = await session.sendAndWait({
      prompt: "Analyze this developer's GitHub Copilot usage by calling the available data tools. Produce the full JSON report covering all 10 checks.",
    }, 120000);

    onProgress?.({ type: 'status', message: 'Parsing agent response...' });
    const content = (result as any)?.data?.content || '';

    // Extract JSON from response (strip markdown fences if present)
    const cleaned = content.replace(/```json\s*/g, '').replace(/```\s*/g, '');
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in agent response');

    const parsed = JSON.parse(jsonMatch[0]);
    const checks: AgentAnalysisResult[] = [];

    for (const item of (parsed.checks || [])) {
      const def = AGENT_CHECKS.find(c => c.id === item.checkId);
      if (!def) continue;
      checks.push({
        checkId: def.id,
        name: def.name,
        category: def.category,
        score: Math.max(0, Math.min(100, item.score || 0)),
        status: item.status || 'needs-improvement',
        finding: item.finding || 'Analysis complete.',
        recommendation: item.recommendation || '',
        evidence: item.evidence || [],
      });
    }

    // Fill in any missing checks
    for (const def of AGENT_CHECKS) {
      if (!checks.find(c => c.checkId === def.id)) {
        checks.push({
          checkId: def.id, name: def.name, category: def.category,
          score: 0, status: 'needs-improvement', finding: 'Not enough data to analyze.', recommendation: '', evidence: [],
        });
      }
    }

    onProgress?.({ type: 'done' });
    return checks;
  } finally {
    await session.destroy().catch(() => {});
  }
}

// Legacy single-check API
export async function runAgentCheck(
  checkId: string,
  sessions: Session[],
  analyzer: Analyzer,
  _token: string,
): Promise<AgentAnalysisResult> {
  const def = AGENT_CHECKS.find(c => c.id === checkId);
  if (!def) {
    return { checkId, name: 'Unknown Check', category: 'unknown', score: 0, status: 'critical', finding: 'Check not found.', recommendation: '', evidence: [] };
  }
  try {
    const results = await runAllAgentChecks(sessions, analyzer);
    return results.find(r => r.checkId === checkId) || {
      checkId: def.id, name: def.name, category: def.category,
      score: 0, status: 'critical', finding: 'Check not returned by agent.', recommendation: '', evidence: [],
    };
  } catch (err) {
    return {
      checkId: def.id, name: def.name, category: def.category,
      score: 0, status: 'critical',
      finding: `Agent analysis failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
      recommendation: 'Ensure GitHub Copilot CLI is installed and authenticated. Run `gh auth login` if needed.',
      evidence: [],
    };
  }
}
