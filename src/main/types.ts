/* Shared type definitions for Argus */

export interface SessionRequest {
  requestId: string;
  timestamp: number | null;
  messageText: string;
  responseText: string;
  isCanceled: boolean;
  agentName: string;
  modelId: string;
  toolsUsed: string[];
  editedFiles: string[];
  referencedFiles: string[];
  firstProgress: number | null;
  totalElapsed: number | null;
  messageLength: number;
  responseLength: number;
  userCode: CodeBlock[];
  aiCode: CodeBlock[];
}

export interface CodeBlock {
  language: string;
  loc: number;
}

export interface Session {
  sessionId: string;
  workspaceId: string;
  workspaceName: string;
  creationDate: number | null;
  lastMessageDate: number | null;
  requestCount: number;
  requests: SessionRequest[];
}

export interface Workspace {
  id: string;
  name: string;
  path: string;
}

export interface DateFilter {
  fromDate?: string;
  toDate?: string;
  workspace?: string;
}

export interface DailyActivity {
  labels: string[];
  values: number[];
  loc: number[];
}

export interface HourlyDistribution {
  hours: number[];
  byType: Record<string, number[]>;
}

export interface HeatmapData {
  heatmap: number[][];
  byType: Record<string, number[][]>;
}

export interface CodeProductionData {
  summary: {
    totalAiLoc: number;
    totalUserLoc: number;
    totalLoc: number;
    aiBlocks: number;
    userBlocks: number;
    aiRatio: number;
    locCost2010: number;
    costPerLoc: number;
  };
  byLanguage: {
    labels: string[];
    aiLoc: number[];
    userLoc: number[];
  };
  dailyTimeline: {
    labels: string[];
    aiLoc: number[];
    userLoc: number[];
  };
  dailyByLanguage: {
    labels: string[];
    datasets: Record<string, number[]>;
  };
  byWorkspace: {
    labels: string[];
    aiLoc: number[];
    userLoc: number[];
  };
}

export interface ConsumptionData {
  totalRequests: number;
  avgPerDay: number;
  avgPerWeek: number;
  avgPerMonth: number;
  modelTotals: Record<string, number>;
  defaultMultipliers: Record<string, number>;
  daily: { labels: string[]; values: number[]; byModel: Record<string, number[]> };
  weekly: { labels: string[]; values: number[]; byModel: Record<string, number[]> };
  monthly: { labels: string[]; values: number[]; byModel: Record<string, number[]> };
  workspaceCosts: Record<string, Record<string, number>>;
}

export interface TimelineSession {
  sessionId: string;
  workspaceName: string;
  sessionName: string;
  firstActivity: number;
  lastActivity: number;
  requestCount: number;
  totalRequestCount: number;
  requests: TimelineRequest[];
}

export interface TimelineRequest {
  timestamp: number;
  messageText: string;
  responseText: string;
  messageLength: number;
  responseLength: number;
  agentName: string;
  modelId: string;
  toolsUsed: string[];
  editedFiles: string[];
  referencedFiles: string[];
  preview: string;
  loc?: number;
  workType?: string;
}

export interface DayTimeline {
  date: string;
  mode: string;
  rangeLabel: string;
  dayStart: number;
  dayEnd: number;
  sessions: TimelineSession[];
  sessionCount: number;
  maxConcurrent: number;
  prevDay: string | null;
  nextDay: string | null;
  firstDay: string | null;
}

export interface JourneyEvent {
  timestamp: number;
  day: string;
  time: string;
  workType: string;
  model: string;
  tools: string[];
  filesEdited: string[];
  filesReferenced: string[];
  languages: string[];
  preview: string;
  isCanceled: boolean;
  loc: number;
  fileLoc: Record<string, number>;
  workspace: string;
}

export interface JourneyData {
  workspace: string;
  totalRequests: number;
  totalSessions: number;
  totalLoC: number;
  dateRange: { from: string | null; to: string | null };
  events: JourneyEvent[];
  techTimeline: { labels: string[]; datasets: Record<string, number[]> };
  filesTimeline: { labels: string[]; counts: number[] };
  modelsTimeline: { labels: string[]; datasets: Record<string, number[]> };
  workTypesTimeline: { labels: string[]; datasets: Record<string, number[]> };
  toolsTimeline: { labels: string[]; datasets: Record<string, number[]> };
  concurrencyTimeline: { labels: string[]; maxConcurrent: number[] };
  summary: {
    totalLoC: number;
    topModels: [string, number][];
    topTools: [string, number][];
    workTypes: [string, number][];
    fileCount: number;
  };
}

export interface SessionListItem {
  sessionId: string;
  workspaceName: string;
  workspaceId: string;
  creationDate: number | null;
  lastMessageDate: number | null;
  requestCount: number;
  firstMessage: string;
}

export interface SessionList {
  total: number;
  page: number;
  pageSize: number;
  sessions: SessionListItem[];
}

export interface WorkspaceBreakdown {
  labels: string[];
  values: number[];
}

export interface BurndownConfig {
  sku: 'individual' | 'business' | 'enterprise';
  customBudget?: number;
  month?: string;
}

export interface BurndownData {
  currentMonth: string;
  daysInMonth: number;
  dayOfMonth: number;
  budget: number;
  consumed: number;
  projected: number;
  dailyConsumption: { labels: string[]; values: number[]; cumulative: number[] };
  projectedLine: number[];
  budgetLine: number[];
  status: 'on-track' | 'warning' | 'over-budget';
  recommendation: string;
}

export type WorkType = 'feature' | 'bug fix' | 'refactor' | 'code review' | 'docs' | 'test' | 'style' | 'config' | 'other';

export const WORK_TYPES: WorkType[] = ['feature', 'bug fix', 'refactor', 'code review', 'docs', 'test', 'style', 'config', 'other'];

export const WORK_TYPE_COLORS: Record<WorkType, string> = {
  'feature': '#58a6ff',
  'bug fix': '#f85149',
  'refactor': '#d29922',
  'code review': '#da7756',
  'docs': '#3fb950',
  'test': '#bc8cff',
  'style': '#f778ba',
  'config': '#79c0ff',
  'other': '#8b949e',
};

export const SKU_BUDGETS: Record<string, number> = {
  'pro': 300,
  'pro-plus': 1500,
  'business': 300,
  'enterprise': 1000,
};

export interface RecommendationCheck {
  id: string;
  name: string;
  category: 'model-usage' | 'workflow' | 'efficiency' | 'features' | 'context';
  description: string;
  requiresAI: boolean;
}

export interface RecommendationResult {
  checkId: string;
  name: string;
  category: string;
  score: number;        // 0-100
  status: 'good' | 'needs-improvement' | 'critical';
  finding: string;
  recommendation: string;
  details?: Record<string, unknown>;
}

export interface AgentAnalysisResult {
  checkId: string;
  name: string;
  category: string;
  score: number;
  status: 'good' | 'needs-improvement' | 'critical';
  finding: string;
  recommendation: string;
  evidence: string[];
}

// IPC Channels
export const IPC = {
  GET_DAILY_ACTIVITY: 'get-daily-activity',
  GET_HOURLY_DISTRIBUTION: 'get-hourly-distribution',
  GET_HEATMAP: 'get-heatmap',
  GET_WORKSPACE_BREAKDOWN: 'get-workspace-breakdown',
  GET_CODE_PRODUCTION: 'get-code-production',
  GET_CONSUMPTION: 'get-consumption',
  GET_DAY_TIMELINE: 'get-day-timeline',
  GET_JOURNEY: 'get-journey',
  GET_SESSIONS: 'get-sessions',
  GET_SESSION_DETAIL: 'get-session-detail',
  GET_WORKSPACES: 'get-workspaces',
  GET_WORKSPACES_WITH_COST: 'get-workspaces-with-cost',
  GET_BURNDOWN: 'get-burndown',
  GET_RECOMMENDATIONS: 'get-recommendations',
  RUN_AGENT_CHECK: 'run-agent-check',
  GET_TIMELINE_ACTIVITY: 'get-timeline-activity',
  RELOAD_DATA: 'reload-data',
  SELECT_LOGS_DIR: 'select-logs-dir',
  GET_LOGS_DIRS: 'get-logs-dirs',
} as const;
