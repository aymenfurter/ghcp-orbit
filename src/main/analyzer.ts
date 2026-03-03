/* Analytics engine - computes all metrics from parsed data */

import {
  Session, DateFilter, DailyActivity, HourlyDistribution, HeatmapData,
  CodeProductionData, ConsumptionData, DayTimeline, JourneyData, JourneyEvent,
  SessionList, WorkspaceBreakdown, BurndownData, BurndownConfig,
  RecommendationResult, WorkType, WORK_TYPES, SKU_BUDGETS, TimelineRequest,
  ToolingData,
} from './types';
import { techFromPath, shortPath } from './parser';

const WORK_TYPE_PATTERNS: Record<string, RegExp> = {
  'bug fix': /\b(fix|bug|error|issue|crash|broken|fail|exception|traceback|debug|wrong|problem)\b/i,
  'feature': /\b(add|create|implement|feature|new|build|introduce|scaffold|generate|setup)\b/i,
  'refactor': /\b(refactor|restructure|reorganize|clean|simplify|move|rename|extract|split|merge|consolidate)\b/i,
  'code review': /\b(review|pr|pull.?request|approve|feedback|nit|lgtm|suggest|comment on|code.?review|changes requested|diff)\b/i,
  'docs': /\b(doc|readme|comment|explain|describe|document|annotation|jsdoc|docstring)\b/i,
  'test': /\b(test|spec|assert|mock|stub|coverage|pytest|jest|unittest)\b/i,
  'style': /\b(style|css|layout|design|theme|color|font|ui|ux|visual|responsive)\b/i,
  'config': /\b(config|setup|install|dependency|package|docker|deploy|ci|cd|pipeline|env|nginx|yaml|toml)\b/i,
};

const MODEL_MULTIPLIERS: Record<string, number> = {
  'claude-haiku-4.5': 0.33, 'claude-opus-4.5': 3, 'claude-opus-4.6': 3,
  'claude-opus-4.6-fast': 30, 'claude-sonnet-4': 1, 'claude-sonnet-4.5': 1,
  'claude-sonnet-4.6': 1, 'claude-3.5-sonnet': 1, 'claude-3.7-sonnet': 1,
  'gemini-2.5-pro': 1, 'gemini-3-flash': 0.33, 'gemini-3-pro': 1,
  'gemini-3-pro-preview': 1, 'gemini-3.1-pro': 1,
  'gpt-4.1': 0, 'gpt-4o': 0, 'gpt-5-mini': 0, 'gpt-5': 1,
  'gpt-5.1': 1, 'gpt-5.1-codex': 1, 'gpt-5.1-codex-mini': 0.33,
  'gpt-5.1-codex-max': 1, 'gpt-5.2': 1, 'gpt-5.2-codex': 1, 'gpt-5.3-codex': 1,
  'grok-code-fast-1': 0.25, 'raptor-mini': 0, 'o3': 1, 'o4-mini': 1,
};

export function normalizeModelId(raw: string): string {
  if (!raw) return 'unknown';
  let name = raw.includes('/') ? raw.split('/').pop()! : raw;
  name = name.replace('-thought', '').replace('-preview', '');
  name = name.replace('claude-opus-41', 'claude-opus-4.5');
  return name;
}

export function classifyWorkType(msgText: string, respText: string): WorkType {
  const combined = msgText + ' ' + respText.slice(0, 500);
  const scores: Record<string, number> = {};
  for (const [label, pat] of Object.entries(WORK_TYPE_PATTERNS)) {
    const hits = (combined.match(new RegExp(pat.source, 'gi')) || []).length;
    if (hits) scores[label] = hits;
  }
  if (Object.keys(scores).length > 0) {
    return Object.entries(scores).sort((a, b) => b[1] - a[1])[0][0] as WorkType;
  }
  return 'other';
}

function tsToDay(ts: number): string {
  const dt = new Date(ts);
  return dt.toLocaleDateString('en-CA'); // YYYY-MM-DD
}

function tsToHour(ts: number): number {
  return new Date(ts).getHours();
}

function tsToWeekday(ts: number): number {
  const d = new Date(ts).getDay();
  return d === 0 ? 6 : d - 1; // Monday=0, Sunday=6
}

function tsToWeekLabel(ts: number): string {
  const dt = new Date(ts);
  return `${dt.getFullYear()}-W${String(getISOWeek(dt)).padStart(2, '0')}`;
}

export class Analyzer {
  constructor(
    private sessions: Session[],
    private editLocIndex: Map<string, Map<string, number>>,
  ) {}

  private filter(f: DateFilter): Session[] {
    let result = this.sessions;
    if (f.workspace) {
      const ws = f.workspace.toLowerCase();
      result = result.filter(s => s.workspaceName.toLowerCase().includes(ws));
    }
    if (f.fromDate) {
      const from = new Date(f.fromDate).getTime();
      result = result.filter(s => (s.creationDate || 0) >= from);
    }
    if (f.toDate) {
      const to = new Date(f.toDate).getTime() + 86400000;
      result = result.filter(s => (s.creationDate || 0) <= to);
    }
    return result;
  }

  getWorkspaces(): string[] {
    const names = new Set(this.sessions.map(s => s.workspaceName));
    return [...names].sort();
  }

  getWorkspacesWithCost(): { name: string; cost: number; requests: number }[] {
    const wsCost = new Map<string, number>();
    const wsReqs = new Map<string, number>();
    for (const s of this.sessions) {
      const ws = s.workspaceName;
      for (const r of s.requests) {
        const model = normalizeModelId(r.modelId);
        const mult = MODEL_MULTIPLIERS[model] ?? 1;
        wsCost.set(ws, (wsCost.get(ws) || 0) + mult * 0.04);
        wsReqs.set(ws, (wsReqs.get(ws) || 0) + 1);
      }
    }
    return [...wsCost.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([name, cost]) => ({ name, cost: Math.round(cost * 100) / 100, requests: wsReqs.get(name) || 0 }));
  }

  getDailyActivity(f: DateFilter): DailyActivity {
    const filtered = this.filter(f);
    const daily = new Map<string, number>();
    const dailyLoc = new Map<string, number>();

    for (const s of filtered) {
      for (const r of s.requests) {
        const ts = r.timestamp || s.creationDate;
        if (!ts) continue;
        const day = tsToDay(ts);
        daily.set(day, (daily.get(day) || 0) + 1);

        const editLoc = this.editLocIndex.get(r.requestId);
        if (editLoc) {
          let total = 0;
          for (const v of editLoc.values()) total += v;
          dailyLoc.set(day, (dailyLoc.get(day) || 0) + total);
        }
      }
    }

    const sorted = [...daily.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    const labels = sorted.map(d => d[0]);
    return {
      labels,
      values: sorted.map(d => d[1]),
      loc: labels.map(d => dailyLoc.get(d) || 0),
    };
  }

  getHourlyDistribution(f: DateFilter): HourlyDistribution {
    const filtered = this.filter(f);
    const hours = new Array(24).fill(0);
    const byType: Record<string, number[]> = {};
    for (const wt of WORK_TYPES) byType[wt] = new Array(24).fill(0);

    for (const s of filtered) {
      for (const r of s.requests) {
        const ts = r.timestamp || s.creationDate;
        if (!ts) continue;
        const h = tsToHour(ts);
        const wt = classifyWorkType(r.messageText, r.responseText);
        hours[h]++;
        byType[wt][h]++;
      }
    }
    return { hours, byType };
  }

  getHeatmap(f: DateFilter): HeatmapData {
    const filtered = this.filter(f);
    const heatmap: number[][] = Array.from({ length: 7 }, () => new Array(24).fill(0));
    const byType: Record<string, number[][]> = {};
    for (const wt of WORK_TYPES) {
      byType[wt] = Array.from({ length: 7 }, () => new Array(24).fill(0));
    }

    for (const s of filtered) {
      for (const r of s.requests) {
        const ts = r.timestamp || s.creationDate;
        if (!ts) continue;
        const wd = tsToWeekday(ts);
        const h = tsToHour(ts);
        const wt = classifyWorkType(r.messageText, r.responseText);
        heatmap[wd][h]++;
        byType[wt][wd][h]++;
      }
    }
    return { heatmap, byType };
  }

  getWorkspaceBreakdown(f: DateFilter): WorkspaceBreakdown {
    const filtered = this.filter(f);
    const counts = new Map<string, number>();
    for (const s of filtered) {
      counts.set(s.workspaceName, (counts.get(s.workspaceName) || 0) + s.requestCount);
    }
    const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    return { labels: sorted.map(i => i[0]), values: sorted.map(i => i[1]) };
  }

  getCodeProduction(f: DateFilter): CodeProductionData {
    const filtered = this.filter(f);
    const aiByLang = new Map<string, number>();
    const userByLang = new Map<string, number>();
    let aiBlocks = 0, userBlocks = 0, totalAiLoc = 0, totalUserLoc = 0;
    const dailyAiLoc = new Map<string, number>();
    const dailyUserLoc = new Map<string, number>();
    const wsAiLoc = new Map<string, number>();
    const wsUserLoc = new Map<string, number>();
    const dailyLangLoc = new Map<string, Map<string, number>>();

    for (const s of filtered) {
      const wsName = s.workspaceName;
      for (const r of s.requests) {
        const ts = r.timestamp || s.creationDate;
        const day = ts ? tsToDay(ts) : null;
        const reqId = r.requestId;
        const editLoc = this.editLocIndex.get(reqId);

        if (editLoc) {
          for (const [uri, lines] of editLoc) {
            const fpath = decodeURIComponent(uri.replace('file://', ''));
            const lang = techFromPath(fpath) || 'Other';
            aiByLang.set(lang, (aiByLang.get(lang) || 0) + lines);
            aiBlocks++;
            totalAiLoc += lines;
            if (day) {
              dailyAiLoc.set(day, (dailyAiLoc.get(day) || 0) + lines);
              if (!dailyLangLoc.has(day)) dailyLangLoc.set(day, new Map());
              const dl = dailyLangLoc.get(day)!;
              dl.set(lang, (dl.get(lang) || 0) + lines);
            }
            wsAiLoc.set(wsName, (wsAiLoc.get(wsName) || 0) + lines);
          }
        } else {
          for (const block of r.aiCode) {
            aiByLang.set(block.language, (aiByLang.get(block.language) || 0) + block.loc);
            aiBlocks++;
            totalAiLoc += block.loc;
            if (day) {
              dailyAiLoc.set(day, (dailyAiLoc.get(day) || 0) + block.loc);
              if (!dailyLangLoc.has(day)) dailyLangLoc.set(day, new Map());
              const dl = dailyLangLoc.get(day)!;
              dl.set(block.language, (dl.get(block.language) || 0) + block.loc);
            }
            wsAiLoc.set(wsName, (wsAiLoc.get(wsName) || 0) + block.loc);
          }
        }

        for (const block of r.userCode) {
          userByLang.set(block.language, (userByLang.get(block.language) || 0) + block.loc);
          userBlocks++;
          totalUserLoc += block.loc;
          if (day) dailyUserLoc.set(day, (dailyUserLoc.get(day) || 0) + block.loc);
          wsUserLoc.set(wsName, (wsUserLoc.get(wsName) || 0) + block.loc);
        }
      }
    }

    // Sort languages
    const allLangs = new Map<string, number>();
    for (const [l, v] of aiByLang) allLangs.set(l, (allLangs.get(l) || 0) + v);
    for (const [l, v] of userByLang) allLangs.set(l, (allLangs.get(l) || 0) + v);
    const sortedLangs = [...allLangs.entries()].sort((a, b) => b[1] - a[1]);

    const allDays = [...new Set([...dailyAiLoc.keys(), ...dailyUserLoc.keys()])].sort();

    const topLangs = sortedLangs.slice(0, 8).map(l => l[0]);
    const dailyStacked: Record<string, number[]> = {};
    for (const lang of topLangs) {
      dailyStacked[lang] = allDays.map(day => dailyLangLoc.get(day)?.get(lang) || 0);
    }

    const wsCombined = new Map<string, number>();
    for (const ws of new Set([...wsAiLoc.keys(), ...wsUserLoc.keys()])) {
      wsCombined.set(ws, (wsAiLoc.get(ws) || 0) + (wsUserLoc.get(ws) || 0));
    }
    const sortedWs = [...wsCombined.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20);

    const totalLoc = totalAiLoc + totalUserLoc;
    const costPerLoc = 20;

    return {
      summary: {
        totalAiLoc, totalUserLoc, totalLoc,
        aiBlocks, userBlocks,
        aiRatio: totalLoc ? Math.round(totalAiLoc / totalLoc * 1000) / 10 : 0,
        locCost2010: totalLoc * costPerLoc, costPerLoc,
      },
      byLanguage: {
        labels: sortedLangs.map(l => l[0]),
        aiLoc: sortedLangs.map(l => aiByLang.get(l[0]) || 0),
        userLoc: sortedLangs.map(l => userByLang.get(l[0]) || 0),
      },
      dailyTimeline: {
        labels: allDays,
        aiLoc: allDays.map(d => dailyAiLoc.get(d) || 0),
        userLoc: allDays.map(d => dailyUserLoc.get(d) || 0),
      },
      dailyByLanguage: { labels: allDays, datasets: dailyStacked },
      byWorkspace: {
        labels: sortedWs.map(w => w[0]),
        aiLoc: sortedWs.map(w => wsAiLoc.get(w[0]) || 0),
        userLoc: sortedWs.map(w => wsUserLoc.get(w[0]) || 0),
      },
    };
  }

  getConsumption(f: DateFilter): ConsumptionData {
    const filtered = this.filter(f);
    const dailyByModel = new Map<string, Map<string, number>>();
    const modelTotals = new Map<string, number>();
    const wsModelTotals = new Map<string, Map<string, number>>();

    for (const s of filtered) {
      const wsName = s.workspaceName;
      for (const r of s.requests) {
        const ts = r.timestamp || s.creationDate;
        if (!ts) continue;
        const day = tsToDay(ts);
        const model = normalizeModelId(r.modelId);

        if (!dailyByModel.has(day)) dailyByModel.set(day, new Map());
        const dm = dailyByModel.get(day)!;
        dm.set(model, (dm.get(model) || 0) + 1);
        modelTotals.set(model, (modelTotals.get(model) || 0) + 1);

        if (!wsModelTotals.has(wsName)) wsModelTotals.set(wsName, new Map());
        const wm = wsModelTotals.get(wsName)!;
        wm.set(model, (wm.get(model) || 0) + 1);
      }
    }

    const sortedDays = [...dailyByModel.keys()].sort();
    const allModels = [...modelTotals.entries()].sort((a, b) => b[1] - a[1]).map(e => e[0]);

    const dailyValues = sortedDays.map(d => {
      let total = 0;
      for (const v of dailyByModel.get(d)!.values()) total += v;
      return total;
    });

    const dailyModels: Record<string, number[]> = {};
    for (const model of allModels) {
      dailyModels[model] = sortedDays.map(d => dailyByModel.get(d)?.get(model) || 0);
    }

    // Weekly
    const weekly = new Map<string, number>();
    const weeklyByModel = new Map<string, Map<string, number>>();
    for (const day of sortedDays) {
      const dt = new Date(day);
      const wk = `${dt.getFullYear()}-W${String(getISOWeek(dt)).padStart(2, '0')}`;
      const dm = dailyByModel.get(day)!;
      let dayTotal = 0;
      for (const v of dm.values()) dayTotal += v;
      weekly.set(wk, (weekly.get(wk) || 0) + dayTotal);
      if (!weeklyByModel.has(wk)) weeklyByModel.set(wk, new Map());
      const wm = weeklyByModel.get(wk)!;
      for (const [model, count] of dm) wm.set(model, (wm.get(model) || 0) + count);
    }
    const sortedWeeks = [...weekly.keys()].sort();

    // Monthly
    const monthly = new Map<string, number>();
    const monthlyByModel = new Map<string, Map<string, number>>();
    for (const day of sortedDays) {
      const mk = day.slice(0, 7);
      const dm = dailyByModel.get(day)!;
      let dayTotal = 0;
      for (const v of dm.values()) dayTotal += v;
      monthly.set(mk, (monthly.get(mk) || 0) + dayTotal);
      if (!monthlyByModel.has(mk)) monthlyByModel.set(mk, new Map());
      const mm = monthlyByModel.get(mk)!;
      for (const [model, count] of dm) mm.set(model, (mm.get(model) || 0) + count);
    }
    const sortedMonths = [...monthly.keys()].sort();

    const totalReqs = [...modelTotals.values()].reduce((a, b) => a + b, 0);
    const numDays = sortedDays.length || 1;
    const numWeeks = sortedWeeks.length || 1;
    const numMonths = sortedMonths.length || 1;

    const workspaceCosts: Record<string, Record<string, number>> = {};
    for (const [ws, models] of wsModelTotals) {
      workspaceCosts[ws] = Object.fromEntries(models);
    }

    return {
      totalRequests: totalReqs,
      avgPerDay: Math.round(totalReqs / numDays * 10) / 10,
      avgPerWeek: Math.round(totalReqs / numWeeks * 10) / 10,
      avgPerMonth: Math.round(totalReqs / numMonths * 10) / 10,
      modelTotals: Object.fromEntries(modelTotals),
      defaultMultipliers: MODEL_MULTIPLIERS,
      daily: {
        labels: sortedDays,
        values: dailyValues,
        byModel: dailyModels,
      },
      weekly: {
        labels: sortedWeeks,
        values: sortedWeeks.map(w => weekly.get(w) || 0),
        byModel: Object.fromEntries(
          allModels.map(m => [m, sortedWeeks.map(w => weeklyByModel.get(w)?.get(m) || 0)])
        ),
      },
      monthly: {
        labels: sortedMonths,
        values: sortedMonths.map(m => monthly.get(m) || 0),
        byModel: Object.fromEntries(
          allModels.map(m => [m, sortedMonths.map(mk => monthlyByModel.get(mk)?.get(m) || 0)])
        ),
      },
      workspaceCosts,
    };
  }

  getDayTimeline(date: string, mode: string, workspace?: string, endDate?: string): DayTimeline {
    let dayStart = new Date(date);
    let rangeDays = 1;

    if (mode === 'range' && endDate) {
      const dayEnd = new Date(endDate);
      rangeDays = Math.max(1, Math.round((dayEnd.getTime() - dayStart.getTime()) / 86400000) + 1);
    } else if (mode === 'week') {
      const dow = dayStart.getDay();
      dayStart = new Date(dayStart.getTime() - ((dow === 0 ? 6 : dow - 1)) * 86400000);
      rangeDays = 7;
    } else if (mode === 'month') {
      dayStart = new Date(dayStart.getFullYear(), dayStart.getMonth(), 1);
      rangeDays = new Date(dayStart.getFullYear(), dayStart.getMonth() + 1, 0).getDate();
    }

    const dayStartTs = dayStart.getTime();
    const dayEndTs = dayStartTs + rangeDays * 86400000;

    const sessionsOnDay: any[] = [];
    for (const s of this.sessions) {
      if (workspace && s.workspaceName !== workspace) continue;
      if (s.requestCount === 0) continue;

      const reqTs = s.requests.filter(r => r.timestamp).map(r => r.timestamp!);
      if (reqTs.length === 0) continue;

      const sStart = Math.min(...reqTs);
      const sEnd = Math.max(...reqTs);
      if (sStart >= dayEndTs || sEnd < dayStartTs) continue;

      const dayRequests: TimelineRequest[] = [];
      for (const r of s.requests) {
        const ts = r.timestamp;
        if (ts && dayStartTs <= ts && ts < dayEndTs) {
          // Compute LoC for this request
          let loc = 0;
          const editLoc = this.editLocIndex.get(r.requestId);
          if (editLoc) {
            for (const v of editLoc.values()) loc += v;
          }
          dayRequests.push({
            timestamp: ts,
            messageText: r.messageText,
            responseText: r.responseText,
            messageLength: r.messageLength,
            responseLength: r.responseLength,
            agentName: r.agentName,
            modelId: r.modelId,
            toolsUsed: r.toolsUsed,
            editedFiles: r.editedFiles,
            referencedFiles: r.referencedFiles,
            preview: r.messageText.slice(0, 120),
            loc,
            workType: classifyWorkType(r.messageText, r.responseText),
          });
        }
      }
      if (dayRequests.length === 0) continue;

      const firstTs = Math.min(...dayRequests.map(r => r.timestamp));
      const lastTs = Math.max(...dayRequests.map(r => r.timestamp));

      // Determine dominant work type for session
      const wtCounts = new Map<string, number>();
      for (const dr of dayRequests) {
        const wt = (dr as any).workType || 'other';
        wtCounts.set(wt, (wtCounts.get(wt) || 0) + 1);
      }
      const dominantWorkType = [...wtCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || 'other';

      sessionsOnDay.push({
        sessionId: s.sessionId,
        workspaceName: s.workspaceName,
        sessionName: s.requests[0]?.messageText.slice(0, 100) || '',
        firstActivity: firstTs,
        lastActivity: lastTs,
        requestCount: dayRequests.length,
        totalRequestCount: s.requestCount,
        requests: dayRequests,
        dominantWorkType,
      });
    }
    sessionsOnDay.sort((a: any, b: any) => a.firstActivity - b.firstActivity);

    // Concurrency
    let maxConcurrent = 0;
    if (sessionsOnDay.length > 0) {
      const events: [number, number][] = [];
      for (const s of sessionsOnDay) {
        events.push([s.firstActivity, 1]);
        events.push([s.lastActivity, -1]);
      }
      events.sort((a, b) => a[0] - b[0]);
      let cur = 0;
      for (const [, delta] of events) {
        cur += delta;
        maxConcurrent = Math.max(maxConcurrent, cur);
      }
    }

    // Navigation
    const allDays = new Set<string>();
    for (const s of this.sessions) {
      if (workspace && s.workspaceName !== workspace) continue;
      if (s.creationDate) allDays.add(tsToDay(s.creationDate));
    }
    const sortedDays = [...allDays].sort();
    const anchor = dayStart.toLocaleDateString('en-CA');

    let prevDay: string | null = null;
    let nextDay: string | null = null;
    if (mode === 'day') {
      const idx = sortedDays.indexOf(anchor);
      if (idx > 0) prevDay = sortedDays[idx - 1];
      else {
        for (const d of sortedDays) { if (d < anchor) prevDay = d; }
      }
      if (idx >= 0 && idx < sortedDays.length - 1) nextDay = sortedDays[idx + 1];
      else {
        for (const d of sortedDays) {
          if (d > anchor && !nextDay) nextDay = d;
        }
      }
    } else if (mode === 'week') {
      const pw = new Date(dayStart.getTime() - 7 * 86400000).toLocaleDateString('en-CA');
      const nw = new Date(dayStart.getTime() + 7 * 86400000).toLocaleDateString('en-CA');
      if (sortedDays.some(d => d >= pw && d < anchor)) prevDay = pw;
      const nEnd = new Date(dayStart.getTime() + 14 * 86400000).toLocaleDateString('en-CA');
      if (sortedDays.some(d => d >= nw && d < nEnd)) nextDay = nw;
    } else if (mode === 'month') {
      const pm = new Date(dayStart.getFullYear(), dayStart.getMonth() - 1, 1);
      const nm = new Date(dayStart.getFullYear(), dayStart.getMonth() + 1, 1);
      prevDay = pm.toLocaleDateString('en-CA');
      nextDay = nm.toLocaleDateString('en-CA');
    }

    const rangeLabel = this.getRangeLabel(dayStart, rangeDays, mode);

    return {
      date: anchor,
      mode,
      rangeLabel,
      dayStart: dayStartTs,
      dayEnd: dayEndTs,
      sessions: sessionsOnDay,
      sessionCount: sessionsOnDay.length,
      maxConcurrent,
      prevDay,
      nextDay,
      firstDay: sortedDays[0] || null,
    };
  }

  private getRangeLabel(start: Date, numDays: number, mode: string): string {
    const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' };
    if (mode === 'week') {
      const end = new Date(start.getTime() + 6 * 86400000);
      return `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${end.toLocaleDateString('en-US', opts)}`;
    }
    if (mode === 'month') {
      return start.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    }
    if (mode === 'range') {
      const end = new Date(start.getTime() + (numDays - 1) * 86400000);
      return `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${end.toLocaleDateString('en-US', opts)} (${numDays} days)`;
    }
    return start.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  }

  getJourney(workspace: string): JourneyData {
    const showAll = !workspace || workspace.toLowerCase() === 'all';
    const wsSessions = showAll ? this.sessions : this.sessions.filter(s => s.workspaceName === workspace);

    const events: JourneyEvent[] = [];
    const techOverTime = new Map<string, Map<string, number>>();
    const filesOverTime = new Map<string, Set<string>>();
    const modelsOverTime = new Map<string, Map<string, number>>();
    const workTypesOverTime = new Map<string, Map<string, number>>();
    const toolsOverTime = new Map<string, Map<string, number>>();

    const allFiles = new Set<string>();
    const allTools = new Map<string, number>();
    const allModels = new Map<string, number>();
    const allWorkTypes = new Map<string, number>();
    let totalRequests = 0;
    let totalLoc = 0;

    const EDIT_TOOL_NAMES = new Set([
      'create_file', 'replace_string_in_file', 'multi_replace_string_in_file',
      'insert_edit_into_file', 'editTool', 'edit_notebook_file',
    ]);

    for (const s of wsSessions) {
      for (const r of s.requests) {
        const ts = r.timestamp || s.creationDate;
        if (!ts) continue;
        totalRequests++;
        const day = tsToDay(ts);
        const dt = new Date(ts);

        const workType = classifyWorkType(r.messageText, r.responseText);
        allWorkTypes.set(workType, (allWorkTypes.get(workType) || 0) + 1);
        if (!workTypesOverTime.has(day)) workTypesOverTime.set(day, new Map());
        const wt = workTypesOverTime.get(day)!;
        wt.set(workType, (wt.get(workType) || 0) + 1);

        const editToolsUsed = r.toolsUsed.filter(t => EDIT_TOOL_NAMES.has(t));
        const hadFileEdits = editToolsUsed.length > 0 || r.editedFiles.length > 0;

        const reqId = r.requestId;
        const editLoc = this.editLocIndex.get(reqId);
        const fileLoc: Record<string, number> = {};

        if (editLoc) {
          for (const [uri, lines] of editLoc) {
            const fpath = decodeURIComponent(uri.replace('file://', ''));
            const tech = techFromPath(fpath);
            if (tech && lines > 0) {
              if (!techOverTime.has(day)) techOverTime.set(day, new Map());
              const tt = techOverTime.get(day)!;
              tt.set(tech, (tt.get(tech) || 0) + lines);
            }
            totalLoc += lines;
            const wsName = showAll ? s.workspaceName : workspace;
            fileLoc[shortPath(fpath, wsName)] = lines;
          }
        } else if (hadFileEdits) {
          const creates = editToolsUsed.filter(t => t === 'create_file').length;
          const replaces = editToolsUsed.filter(t => t !== 'create_file').length;
          const locFactor = creates > 0 && replaces === 0 ? 1.0 : replaces > 0 ? 0.55 : 1.0;

          for (const block of [...r.aiCode, ...r.userCode]) {
            const loc = Math.floor(block.loc * locFactor);
            totalLoc += loc;
            if (block.language && block.language !== 'unknown' && loc > 0) {
              const display = techFromPath(`file.${block.language}`) || block.language;
              if (!techOverTime.has(day)) techOverTime.set(day, new Map());
              const tt = techOverTime.get(day)!;
              tt.set(display, (tt.get(display) || 0) + loc);
            }
          }
        }

        const wsName = showAll ? s.workspaceName : workspace;
        const touched = new Set<string>();
        for (const f of r.editedFiles) { const sp = shortPath(f, wsName); touched.add(sp); }
        for (const f of r.referencedFiles) { const sp = shortPath(f, wsName); touched.add(sp); }
        if (touched.size > 0) {
          if (!filesOverTime.has(day)) filesOverTime.set(day, new Set());
          for (const f of touched) { filesOverTime.get(day)!.add(f); allFiles.add(f); }
        }

        const model = r.modelId;
        if (model) {
          const shortModel = model.includes('/') ? model.split('/').pop()! : model;
          allModels.set(shortModel, (allModels.get(shortModel) || 0) + 1);
          if (!modelsOverTime.has(day)) modelsOverTime.set(day, new Map());
          const mm = modelsOverTime.get(day)!;
          mm.set(shortModel, (mm.get(shortModel) || 0) + 1);
        }

        for (const tool of r.toolsUsed) {
          allTools.set(tool, (allTools.get(tool) || 0) + 1);
          if (!toolsOverTime.has(day)) toolsOverTime.set(day, new Map());
          const tt = toolsOverTime.get(day)!;
          tt.set(tool, (tt.get(tool) || 0) + 1);
        }

        const rawLangs = new Set<string>();
        for (const b of [...r.aiCode, ...r.userCode]) {
          if (b.language && b.language !== 'unknown') {
            rawLangs.add(techFromPath(`file.${b.language}`) || b.language);
          }
        }
        for (const f of [...r.editedFiles, ...r.referencedFiles]) {
          const tech = techFromPath(f);
          if (tech) rawLangs.add(tech);
        }

        const requestLoc = Object.values(fileLoc).reduce((a, b) => a + b, 0);

        events.push({
          timestamp: ts,
          day,
          time: `${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`,
          workType,
          model: model.includes('/') ? model.split('/').pop()! : model,
          tools: r.toolsUsed,
          filesEdited: r.editedFiles.map(f => shortPath(f, wsName)),
          filesReferenced: r.referencedFiles.map(f => shortPath(f, wsName)),
          languages: [...rawLangs].sort(),
          preview: r.messageText.slice(0, 120),
          isCanceled: r.isCanceled,
          loc: requestLoc,
          fileLoc,
          workspace: s.workspaceName,
        });
      }
    }

    events.sort((a, b) => a.timestamp - b.timestamp);

    const allDays = [...new Set([
      ...techOverTime.keys(), ...filesOverTime.keys(),
      ...modelsOverTime.keys(), ...workTypesOverTime.keys(),
      ...toolsOverTime.keys(),
    ])].sort();

    const topTech = [...new Set([...techOverTime.values()].flatMap(m => [...m.keys()]))]
      .sort((a, b) => {
        const aSum = allDays.reduce((s, d) => s + (techOverTime.get(d)?.get(a) || 0), 0);
        const bSum = allDays.reduce((s, d) => s + (techOverTime.get(d)?.get(b) || 0), 0);
        return bSum - aSum;
      }).slice(0, 10);

    const topTools = [...allTools.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(e => e[0]);
    const topModels = [...allModels.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(e => e[0]);
    const workTypeLabels = [...allWorkTypes.entries()].sort((a, b) => b[1] - a[1]).map(e => e[0]);

    // Session concurrency over time: for each day, count max overlapping sessions
    const dailyConcurrency: number[] = [];
    for (const day of allDays) {
      const daySessions = wsSessions.filter(s => {
        if (!s.creationDate || !s.lastMessageDate) return false;
        const sDay = tsToDay(s.creationDate);
        const eDay = tsToDay(s.lastMessageDate);
        return sDay <= day && eDay >= day;
      });
      if (daySessions.length <= 1) { dailyConcurrency.push(daySessions.length); continue; }
      const evts: [number, number][] = [];
      for (const s of daySessions) {
        evts.push([s.creationDate!, 1]);
        evts.push([s.lastMessageDate!, -1]);
      }
      evts.sort((a, b) => a[0] - b[0]);
      let cur = 0, mx = 0;
      for (const [, d] of evts) { cur += d; mx = Math.max(mx, cur); }
      dailyConcurrency.push(mx);
    }

    return {
      workspace: workspace || 'All Workspaces',
      totalRequests,
      totalSessions: wsSessions.length,
      totalLoC: totalLoc,
      dateRange: { from: allDays[0] || null, to: allDays[allDays.length - 1] || null },
      events,
      techTimeline: {
        labels: allDays,
        datasets: Object.fromEntries(topTech.map(t => [t, allDays.map(d => techOverTime.get(d)?.get(t) || 0)])),
      },
      filesTimeline: {
        labels: allDays,
        counts: allDays.map(d => filesOverTime.get(d)?.size || 0),
      },
      modelsTimeline: {
        labels: allDays,
        datasets: Object.fromEntries(topModels.map(m => [m, allDays.map(d => modelsOverTime.get(d)?.get(m) || 0)])),
      },
      workTypesTimeline: {
        labels: allDays,
        datasets: Object.fromEntries(workTypeLabels.map(wt => [wt, allDays.map(d => workTypesOverTime.get(d)?.get(wt) || 0)])),
      },
      toolsTimeline: {
        labels: allDays,
        datasets: Object.fromEntries(topTools.map(t => [t, allDays.map(d => toolsOverTime.get(d)?.get(t) || 0)])),
      },
      concurrencyTimeline: {
        labels: allDays,
        maxConcurrent: dailyConcurrency,
      },
      summary: {
        totalLoC: totalLoc,
        topModels: [...allModels.entries()].sort((a, b) => b[1] - a[1]),
        topTools: [...allTools.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15),
        workTypes: [...allWorkTypes.entries()].sort((a, b) => b[1] - a[1]),
        fileCount: allFiles.size,
      },
    };
  }

  getSessions(f: DateFilter, page: number, pageSize: number): SessionList {
    const filtered = this.filter(f);
    filtered.sort((a, b) => (b.creationDate || 0) - (a.creationDate || 0));
    const total = filtered.length;
    const start = (page - 1) * pageSize;
    const end = start + pageSize;

    return {
      total, page, pageSize,
      sessions: filtered.slice(start, end).map(s => ({
        sessionId: s.sessionId,
        workspaceName: s.workspaceName,
        workspaceId: s.workspaceId,
        creationDate: s.creationDate,
        lastMessageDate: s.lastMessageDate,
        requestCount: s.requestCount,
        firstMessage: s.requests[0]?.messageText.slice(0, 200) || '',
      })),
    };
  }

  getSessionDetail(sessionId: string) {
    const s = this.sessions.find(s => s.sessionId === sessionId);
    if (!s) return null;

    return {
      ...s,
      requests: s.requests.map(r => {
        const editLoc = this.editLocIndex.get(r.requestId);
        const perFile: Record<string, number> = {};
        let editLocTotal = 0;
        if (editLoc) {
          for (const [uri, lines] of editLoc) {
            const fpath = decodeURIComponent(uri.replace('file://', ''));
            const short = fpath.split('/').pop() || fpath;
            perFile[short] = lines;
            editLocTotal += lines;
          }
        }
        return { ...r, editLoc: perFile, editLocTotal };
      }),
    };
  }

  getTimelineActivity(workspace?: string) {
    const daily = new Map<string, number>();
    const dailySessions = new Map<string, number>();
    const dailyLoc = new Map<string, number>();

    for (const s of this.sessions) {
      if (workspace && s.workspaceName !== workspace) continue;
      const sessionDays = new Set<string>();
      for (const r of s.requests) {
        const ts = r.timestamp || s.creationDate;
        if (!ts) continue;
        const day = tsToDay(ts);
        daily.set(day, (daily.get(day) || 0) + 1);
        sessionDays.add(day);

        const editLoc = this.editLocIndex.get(r.requestId);
        if (editLoc) {
          let total = 0;
          for (const v of editLoc.values()) total += v;
          dailyLoc.set(day, (dailyLoc.get(day) || 0) + total);
        }
      }
      for (const d of sessionDays) dailySessions.set(d, (dailySessions.get(d) || 0) + 1);
    }

    const sorted = [...daily.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    const labels = sorted.map(d => d[0]);
    return {
      labels,
      messages: sorted.map(d => d[1]),
      sessions: labels.map(d => dailySessions.get(d) || 0),
      loc: labels.map(d => dailyLoc.get(d) || 0),
    };
  }

  getBurndown(config: BurndownConfig): BurndownData {
    const now = new Date();
    let year: number, month: number;
    if (config.month) {
      const [y, m] = config.month.split('-').map(Number);
      year = y; month = m - 1;
    } else {
      year = now.getFullYear(); month = now.getMonth();
    }
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const isCurrentMonth = year === now.getFullYear() && month === now.getMonth();
    const dayOfMonth = isCurrentMonth ? now.getDate() : daysInMonth;
    const budget = config.customBudget || SKU_BUDGETS[config.sku] || 300;
    const currentMonth = `${year}-${String(month + 1).padStart(2, '0')}`;

    // Get daily premium consumption for current month
    const dailyConsumption = new Map<string, number>();
    for (const s of this.sessions) {
      for (const r of s.requests) {
        const ts = r.timestamp || s.creationDate;
        if (!ts) continue;
        const day = tsToDay(ts);
        if (!day.startsWith(currentMonth)) continue;
        const model = normalizeModelId(r.modelId);
        const mult = MODEL_MULTIPLIERS[model] ?? 1;
        dailyConsumption.set(day, (dailyConsumption.get(day) || 0) + mult);
      }
    }

    const labels: string[] = [];
    const values: number[] = [];
    const cumulative: number[] = [];
    let running = 0;
    for (let d = 1; d <= daysInMonth; d++) {
      const dayStr = `${currentMonth}-${String(d).padStart(2, '0')}`;
      labels.push(dayStr);
      const val = Math.round((dailyConsumption.get(dayStr) || 0) * 100) / 100;
      values.push(val);
      running += val;
      cumulative.push(Math.round(running * 100) / 100);
    }

    const consumed = cumulative[dayOfMonth - 1] || 0;
    const avgPerDay = dayOfMonth > 0 ? consumed / dayOfMonth : 0;
    const projected = Math.round(avgPerDay * daysInMonth * 100) / 100;

    // Budget line (flat)
    const budgetLine = new Array(daysInMonth).fill(budget);

    // Projected line (linear extrapolation from current consumption)
    const projectedLine = labels.map((_, i) => Math.round(avgPerDay * (i + 1) * 100) / 100);

    let status: 'on-track' | 'warning' | 'over-budget';
    let recommendation: string;
    if (projected > budget * 1.2) {
      status = 'over-budget';
      recommendation = `At current rate, you'll use ~${Math.round(projected)} premium requests, exceeding your ${budget} budget by ${Math.round(((projected / budget) - 1) * 100)}%. Consider switching to lighter models (GPT-4o, Raptor Mini) for routine tasks.`;
    } else if (projected > budget * 0.85) {
      status = 'warning';
      recommendation = `You're on pace to use ~${Math.round(projected)} of ${budget} premium requests. Monitor usage and consider using included models for simple tasks.`;
    } else {
      status = 'on-track';
      recommendation = `You're on track to use ~${Math.round(projected)} of ${budget} premium requests. Good budget management.`;
    }

    return {
      currentMonth, daysInMonth, dayOfMonth, budget,
      consumed, projected,
      dailyConsumption: { labels, values, cumulative },
      projectedLine, budgetLine,
      status, recommendation,
    };
  }

  getTooling(f: DateFilter): ToolingData {
    const filtered = this.filter(f);

    const agentModeCount = new Map<string, number>();
    const varKindCount = new Map<string, number>();
    const slashCmdCount = new Map<string, number>();
    const toolCallCount = new Map<string, number>();
    const instructionFileCount = new Map<string, number>();
    const modelByMode = new Map<string, Map<string, number>>();
    const mcpServerTools = new Map<string, Map<string, number>>();
    const skillCount = new Map<string, number>();
    let promptFileUsage = 0;
    let promptTextUsage = 0;
    let totalInstructionRefs = 0;
    let totalRequests = 0;
    let fileRefs = 0, directoryRefs = 0, symbolRefs = 0, imageRefs = 0;
    let workspaceRefs = 0, linkRefs = 0, totalVarRefs = 0;

    // Weekly trends
    const weeklyAgentMode = new Map<string, Map<string, number>>();
    const weeklyVarKind = new Map<string, Map<string, number>>();
    const weeklyToolCall = new Map<string, Map<string, number>>();
    const weeklyMcpServer = new Map<string, Map<string, number>>();
    const weeklySkill = new Map<string, Map<string, number>>();

    const AGENT_MODE_LABELS: Record<string, string> = {
      'github.copilot.editsAgent': 'Agent Mode',
      'github.copilot.editingSession': 'Edit Mode',
      'github.copilot.editingSession2': 'Edit Mode v2',
      'github.copilot.default': 'Chat Panel',
      'github.copilot.workspace': 'Workspace',
      'github.copilot.notebook': 'Notebook',
      'github.copilot.editor': 'Inline Editor',
      'github.copilot.terminalPanel': 'Terminal',
      'github.copilot.vscode': 'VS Code',
      'copilotcli': 'CLI',
      'copilot-swe-agent': 'SWE Agent',
      'copilot-cloud-agent': 'Cloud Agent',
    };

    for (const s of filtered) {
      for (const r of s.requests) {
        totalRequests++;
        const ts = r.timestamp || s.creationDate;
        const week = ts ? tsToWeekLabel(ts) : '';

        // Agent mode
        const mode = r.agentMode || '(unknown)';
        const modeLabel = AGENT_MODE_LABELS[mode] || mode.replace('github.copilot.', '').replace(/\./g, ' ');
        agentModeCount.set(modeLabel, (agentModeCount.get(modeLabel) || 0) + 1);
        if (week) {
          if (!weeklyAgentMode.has(week)) weeklyAgentMode.set(week, new Map());
          const wm = weeklyAgentMode.get(week)!;
          wm.set(modeLabel, (wm.get(modeLabel) || 0) + 1);
        }

        // Model by mode
        const model = normalizeModelId(r.modelId);
        if (!modelByMode.has(modeLabel)) modelByMode.set(modeLabel, new Map());
        const mm = modelByMode.get(modeLabel)!;
        mm.set(model, (mm.get(model) || 0) + 1);

        // Variable kinds
        const vk = r.variableKinds || {};
        for (const [kind, cnt] of Object.entries(vk)) {
          const n = cnt as number;
          varKindCount.set(kind, (varKindCount.get(kind) || 0) + n);
          totalVarRefs += n;
          if (kind === 'file') fileRefs += n;
          else if (kind === 'directory') directoryRefs += n;
          else if (kind === 'symbol') symbolRefs += n;
          else if (kind === 'image') imageRefs += n;
          else if (kind === 'workspace') workspaceRefs += n;
          else if (kind === 'link') linkRefs += n;
          else if (kind === 'promptFile') promptFileUsage += n;
          else if (kind === 'promptText') promptTextUsage += n;

          if (week) {
            if (!weeklyVarKind.has(week)) weeklyVarKind.set(week, new Map());
            const wv = weeklyVarKind.get(week)!;
            wv.set(kind, (wv.get(kind) || 0) + n);
          }
        }

        // Custom instructions
        const ci = r.customInstructions || [];
        for (const fname of ci) {
          totalInstructionRefs++;
          instructionFileCount.set(fname, (instructionFileCount.get(fname) || 0) + 1);
        }

        // Slash commands
        if (r.slashCommand) {
          slashCmdCount.set(r.slashCommand, (slashCmdCount.get(r.slashCommand) || 0) + 1);
        }

        // Tool calls
        for (const tool of r.toolsUsed) {
          toolCallCount.set(tool, (toolCallCount.get(tool) || 0) + 1);
          if (week) {
            if (!weeklyToolCall.has(week)) weeklyToolCall.set(week, new Map());
            const wt = weeklyToolCall.get(week)!;
            wt.set(tool, (wt.get(tool) || 0) + 1);
          }

          // MCP server extraction from tool name
          if (tool.startsWith('mcp_')) {
            const rest = tool.slice(4);
            const sep = rest.indexOf('_');
            const server = sep > 0 ? rest.slice(0, sep) : rest;
            if (!mcpServerTools.has(server)) mcpServerTools.set(server, new Map());
            mcpServerTools.get(server)!.set(tool, (mcpServerTools.get(server)!.get(tool) || 0) + 1);
            if (week) {
              if (!weeklyMcpServer.has(week)) weeklyMcpServer.set(week, new Map());
              const ws = weeklyMcpServer.get(week)!;
              ws.set(server, (ws.get(server) || 0) + 1);
            }
          }
        }

        // Skills
        for (const skill of (r.skillsUsed || [])) {
          skillCount.set(skill, (skillCount.get(skill) || 0) + 1);
          if (week) {
            if (!weeklySkill.has(week)) weeklySkill.set(week, new Map());
            const wsk = weeklySkill.get(week)!;
            wsk.set(skill, (wsk.get(skill) || 0) + 1);
          }
        }
      }
    }

    // Build agent modes array
    const agentModes = [...agentModeCount.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([label, count]) => ({ label, count, pct: totalRequests > 0 ? count / totalRequests : 0 }));

    // Build variable kinds array
    const variableKinds = [...varKindCount.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([kind, count]) => ({ kind, count }));

    // Build slash commands
    const slashCommands = [...slashCmdCount.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, count }));

    // Build tool calls
    const toolCalls = [...toolCallCount.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, count }));

    // Build instruction files
    const instructionFiles = [...instructionFileCount.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, count }));

    // Build model by mode
    const modelByModeArr = [...modelByMode.entries()]
      .sort((a, b) => b[1].size - a[1].size)
      .map(([mode, models]) => ({
        mode,
        models: [...models.entries()]
          .filter(([model]) => model !== 'unknown')
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([model, count]) => ({ model, count })),
      }))
      .filter(entry => entry.models.length > 0);

    // Build weekly trends
    const allWeeks = new Set<string>();
    for (const w of weeklyAgentMode.keys()) allWeeks.add(w);
    for (const w of weeklyVarKind.keys()) allWeeks.add(w);
    for (const w of weeklyToolCall.keys()) allWeeks.add(w);
    const weekLabels = [...allWeeks].sort();

    const topModes = agentModes.slice(0, 5).map(m => m.label);
    const agentModeSeries: Record<string, number[]> = {};
    for (const m of topModes) {
      agentModeSeries[m] = weekLabels.map(w => weeklyAgentMode.get(w)?.get(m) || 0);
    }

    const topVarKinds = variableKinds.slice(0, 6).map(v => v.kind);
    const variableKindSeries: Record<string, number[]> = {};
    for (const k of topVarKinds) {
      variableKindSeries[k] = weekLabels.map(w => weeklyVarKind.get(w)?.get(k) || 0);
    }

    // Top tools for trends (excluding very common ones, keep top 6)
    const topTools = toolCalls.slice(0, 6).map(t => t.name);
    const toolCallSeries: Record<string, number[]> = {};
    for (const t of topTools) {
      toolCallSeries[t] = weekLabels.map(w => weeklyToolCall.get(w)?.get(t) || 0);
    }

    // Build MCP servers array
    const mcpServers = [...mcpServerTools.entries()]
      .map(([name, toolMap]) => ({
        name,
        calls: [...toolMap.values()].reduce((a, b) => a + b, 0),
        tools: [...toolMap.entries()]
          .sort((a, b) => b[1] - a[1])
          .map(([tname, count]) => ({ name: tname.replace(`mcp_${name}_`, ''), count })),
      }))
      .sort((a, b) => b.calls - a.calls);

    // Build skills array
    const skills = [...skillCount.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, count }));

    // MCP server weekly trends (top 5)
    const topMcpServers = mcpServers.slice(0, 5).map(s => s.name);
    const mcpServerSeries: Record<string, number[]> = {};
    for (const s of topMcpServers) {
      mcpServerSeries[s] = weekLabels.map(w => weeklyMcpServer.get(w)?.get(s) || 0);
    }

    // Skills weekly trends (top 5)
    const topSkills = skills.slice(0, 5).map(s => s.name);
    const skillSeries: Record<string, number[]> = {};
    for (const s of topSkills) {
      skillSeries[s] = weekLabels.map(w => weeklySkill.get(w)?.get(s) || 0);
    }

    return {
      agentModes,
      variableKinds,
      slashCommands,
      customization: {
        totalInstructionRefs,
        instructionFiles,
        promptFileUsage,
        promptTextUsage,
        totalRequests,
      },
      toolCalls,
      mcpServers,
      skills,
      contextQuality: {
        fileRefs, directoryRefs, symbolRefs, imageRefs,
        workspaceRefs, linkRefs,
        avgRefsPerRequest: totalRequests > 0 ? totalVarRefs / totalRequests : 0,
      },
      modelByMode: modelByModeArr,
      weeklyTrends: {
        labels: weekLabels,
        agentModeSeries,
        variableKindSeries,
        toolCallSeries,
        mcpServerSeries,
        skillSeries,
      },
    };
  }

  getRecommendations(workspace?: string): RecommendationResult[] {
    const scoped = this.scopeSessions(workspace);
    const results: RecommendationResult[] = [];

    // 1. Model Switch Efficiency
    results.push(this.checkModelSwitchEfficiency(scoped));
    // 2. Right Model for Right Task
    results.push(this.checkModelTaskAlignment(scoped));
    // 3. Planning Mode Usage
    results.push(this.checkPlanningModeUsage(scoped));
    // 4. Context Flushing
    results.push(this.checkContextFlushing(scoped));
    // 5. Slash Command Usage
    results.push(this.checkSlashCommandUsage(scoped));
    // 6. Feature Usage
    results.push(this.checkFeatureUsage(scoped));
    // 7. Session Parallelism
    results.push(this.checkSessionParallelism(scoped));
    // 8. Cancellation Rate
    results.push(this.checkCancellationRate(scoped));
    // 9. Tool Usage Diversity
    results.push(this.checkToolUsageDiversity(scoped));
    // 10. Response Time Awareness
    results.push(this.checkResponseTimeAwareness(scoped));
    // 11. File Reference Patterns
    results.push(this.checkFileReferencePatterns(scoped));
    // 12. Session Length Optimization
    results.push(this.checkSessionLengthOptimization(scoped));

    return results;
  }

  private scopeSessions(workspace?: string): Session[] {
    if (!workspace || workspace.toLowerCase() === 'all') return this.sessions;
    return this.sessions.filter(s => s.workspaceName === workspace);
  }

  private checkModelSwitchEfficiency(sessions: Session[]): RecommendationResult {
    const modelCounts = new Map<string, number>();
    let totalRequests = 0;
    for (const s of sessions) {
      for (const r of s.requests) {
        const model = normalizeModelId(r.modelId);
        modelCounts.set(model, (modelCounts.get(model) || 0) + 1);
        totalRequests++;
      }
    }
    const uniqueModels = modelCounts.size;
    const topModel = [...modelCounts.entries()].sort((a, b) => b[1] - a[1])[0];
    const topPct = topModel ? Math.round(topModel[1] / totalRequests * 100) : 0;

    let score: number, status: 'good' | 'needs-improvement' | 'critical';
    if (uniqueModels >= 4 && topPct < 60) { score = 90; status = 'good'; }
    else if (uniqueModels >= 2 && topPct < 80) { score = 60; status = 'needs-improvement'; }
    else { score = 30; status = 'critical'; }

    return {
      checkId: 'model-switch', name: 'Model Switch Efficiency',
      category: 'model-usage', score, status,
      finding: `Using ${uniqueModels} models. Most used: ${topModel?.[0] || 'unknown'} (${topPct}%).`,
      recommendation: score < 70
        ? 'Switch models more often. Use lighter models (GPT-4o, Gemini Flash) for simple tasks and reserve premium models for complex work.'
        : 'Good model diversity. You\'re using multiple models effectively.',
    };
  }

  private checkModelTaskAlignment(sessions: Session[]): RecommendationResult {
    let aligned = 0, total = 0;
    const lightTasks: WorkType[] = ['docs', 'style', 'config'];
    const heavyTasks: WorkType[] = ['bug fix', 'feature', 'refactor'];

    for (const s of sessions) {
      for (const r of s.requests) {
        const wt = classifyWorkType(r.messageText, r.responseText);
        const model = normalizeModelId(r.modelId);
        const mult = MODEL_MULTIPLIERS[model] ?? 1;
        total++;
        if (lightTasks.includes(wt) && mult <= 0.5) aligned++;
        else if (heavyTasks.includes(wt) && mult >= 0.5) aligned++;
        else if (!lightTasks.includes(wt) && !heavyTasks.includes(wt)) aligned++;
      }
    }

    const pct = total > 0 ? Math.round(aligned / total * 100) : 0;
    const score = pct;
    const status: 'good' | 'needs-improvement' | 'critical' = pct >= 70 ? 'good' : pct >= 40 ? 'needs-improvement' : 'critical';

    return {
      checkId: 'model-task-align', name: 'Model-Task Alignment',
      category: 'model-usage', score, status,
      finding: `${pct}% of requests use an appropriately-sized model for the task type.`,
      recommendation: score < 70
        ? 'Use lighter models for documentation, styling, and config tasks. Save premium models for complex debugging and feature work.'
        : 'Good alignment between model choice and task complexity.',
    };
  }

  private checkPlanningModeUsage(sessions: Session[]): RecommendationResult {
    let planningCount = 0, totalSessions = 0;
    for (const s of sessions) {
      if (s.requestCount < 3) continue;
      totalSessions++;
      const firstMsg = s.requests[0]?.messageText.toLowerCase() || '';
      if (firstMsg.includes('plan') || firstMsg.includes('step by step') || firstMsg.includes('break down')) {
        planningCount++;
      }
    }
    const pct = totalSessions > 0 ? Math.round(planningCount / totalSessions * 100) : 0;
    const score = Math.min(100, pct * 2);
    const status: 'good' | 'needs-improvement' | 'critical' = score >= 60 ? 'good' : score >= 30 ? 'needs-improvement' : 'critical';

    return {
      checkId: 'planning-mode', name: 'Planning Mode Usage',
      category: 'workflow', score, status,
      finding: `${pct}% of multi-turn sessions start with planning/structured approach.`,
      recommendation: score < 60
        ? 'Start complex tasks with a plan. Use phrases like "Let\'s plan this out" or "Break this down step by step" to improve output quality.'
        : 'Good use of planning and structured approaches.',
    };
  }

  private checkContextFlushing(sessions: Session[]): RecommendationResult {
    const sessionLengths: number[] = [];
    for (const s of sessions) {
      sessionLengths.push(s.requestCount);
    }
    const avgLength = sessionLengths.length > 0
      ? sessionLengths.reduce((a, b) => a + b, 0) / sessionLengths.length : 0;
    const longSessions = sessionLengths.filter(l => l > 30).length;
    const longPct = sessionLengths.length > 0 ? Math.round(longSessions / sessionLengths.length * 100) : 0;

    let score: number;
    if (longPct < 5 && avgLength < 20) score = 90;
    else if (longPct < 15 && avgLength < 30) score = 60;
    else score = 30;

    const status: 'good' | 'needs-improvement' | 'critical' = score >= 70 ? 'good' : score >= 40 ? 'needs-improvement' : 'critical';

    return {
      checkId: 'context-flush', name: 'Context Management',
      category: 'context', score, status,
      finding: `Average session length: ${Math.round(avgLength)} messages. ${longPct}% of sessions exceed 30 messages.`,
      recommendation: score < 70
        ? 'Start new sessions more frequently. Long sessions degrade quality as context fills up. Aim for focused sessions under 20-25 messages.'
        : 'Good context management. You\'re keeping sessions focused.',
    };
  }

  private checkSlashCommandUsage(sessions: Session[]): RecommendationResult {
    const slashCmds = new Map<string, number>();
    let totalMessages = 0;
    const knownCmds = ['/explain', '/docs', '/tests', '/fix', '/new', '/clear', '/help'];

    for (const s of sessions) {
      for (const r of s.requests) {
        totalMessages++;
        const msg = r.messageText.trim();
        if (msg.startsWith('/')) {
          const cmd = msg.split(/\s/)[0].toLowerCase();
          slashCmds.set(cmd, (slashCmds.get(cmd) || 0) + 1);
        }
      }
    }

    const totalSlash = [...slashCmds.values()].reduce((a, b) => a + b, 0);
    const usagePct = totalMessages > 0 ? Math.round(totalSlash / totalMessages * 100) : 0;
    const uniqueCmds = slashCmds.size;
    const score = Math.min(100, usagePct * 5 + uniqueCmds * 10);
    const status: 'good' | 'needs-improvement' | 'critical' = score >= 60 ? 'good' : score >= 30 ? 'needs-improvement' : 'critical';

    return {
      checkId: 'slash-commands', name: 'Slash Command Usage',
      category: 'features', score, status,
      finding: `Used ${uniqueCmds} different slash commands in ${usagePct}% of messages.`,
      recommendation: score < 60
        ? `Try using slash commands like ${knownCmds.join(', ')} for targeted actions. They're faster and more precise than natural language for common tasks.`
        : 'Good use of slash commands for efficient interactions.',
    };
  }

  private checkFeatureUsage(sessions: Session[]): RecommendationResult {
    const features = new Set<string>();
    for (const s of sessions) {
      for (const r of s.requests) {
        if (r.toolsUsed.length > 0) features.add('tools');
        if (r.editedFiles.length > 0) features.add('file-editing');
        if (r.referencedFiles.length > 0) features.add('file-references');
        if (r.agentName && r.agentName !== 'GitHub Copilot') features.add('agents');
        if (r.messageText.startsWith('/')) features.add('slash-commands');
        if (r.messageText.includes('#file') || r.messageText.includes('@workspace')) features.add('context-variables');
      }
    }

    const score = Math.min(100, features.size * 20);
    const status: 'good' | 'needs-improvement' | 'critical' = score >= 60 ? 'good' : score >= 30 ? 'needs-improvement' : 'critical';

    return {
      checkId: 'feature-usage', name: 'Feature Utilization',
      category: 'features', score, status,
      finding: `Using ${features.size} out of 6 key features: ${[...features].join(', ')}.`,
      recommendation: score < 60
        ? 'Explore more Copilot features: file references (#file), workspace context (@workspace), agents, and tools for more effective coding.'
        : 'Great feature utilization across the platform.',
    };
  }

  private checkSessionParallelism(sessions: Session[]): RecommendationResult {
    // Check how effectively the user runs parallel sessions
    const dailySessions = new Map<string, { sessions: { start: number; end: number; workspace: string }[] }>();

    for (const s of sessions) {
      if (s.requestCount === 0 || !s.creationDate || !s.lastMessageDate) continue;
      const day = tsToDay(s.creationDate);
      if (!dailySessions.has(day)) dailySessions.set(day, { sessions: [] });
      dailySessions.get(day)!.sessions.push({
        start: s.creationDate, end: s.lastMessageDate, workspace: s.workspaceName,
      });
    }

    let parallelDays = 0, totalDays = 0;
    let maxConcurrent = 0;
    let multiWorkspaceDays = 0;

    for (const [, info] of dailySessions) {
      totalDays++;
      const workspaces = new Set(info.sessions.map(s => s.workspace));
      if (workspaces.size > 1) multiWorkspaceDays++;

      // Check for overlap
      const events: [number, number][] = [];
      for (const s of info.sessions) {
        events.push([s.start, 1]);
        events.push([s.end, -1]);
      }
      events.sort((a, b) => a[0] - b[0]);
      let cur = 0, maxDay = 0;
      for (const [, d] of events) { cur += d; maxDay = Math.max(maxDay, cur); }
      if (maxDay > 1) parallelDays++;
      maxConcurrent = Math.max(maxConcurrent, maxDay);
    }

    const parallelPct = totalDays > 0 ? Math.round(parallelDays / totalDays * 100) : 0;
    const multiWsPct = totalDays > 0 ? Math.round(multiWorkspaceDays / totalDays * 100) : 0;
    const score = Math.min(100, parallelPct * 2 + multiWsPct);
    const status: 'good' | 'needs-improvement' | 'critical' = score >= 60 ? 'good' : score >= 30 ? 'needs-improvement' : 'critical';

    return {
      checkId: 'parallelism', name: 'Session Parallelism',
      category: 'efficiency', score, status,
      finding: `Parallel sessions on ${parallelPct}% of active days. Max concurrent: ${maxConcurrent}. Multi-workspace days: ${multiWsPct}%.`,
      recommendation: score < 60
        ? 'Run sessions in parallel when working on different aspects. Use separate sessions for different files/features to maintain focused context.'
        : 'Good parallel session usage across workspaces.',
    };
  }

  private checkCancellationRate(sessions: Session[]): RecommendationResult {
    let canceled = 0, total = 0;
    for (const s of sessions) {
      for (const r of s.requests) {
        total++;
        if (r.isCanceled) canceled++;
      }
    }
    const pct = total > 0 ? Math.round(canceled / total * 100) : 0;
    const score = Math.max(0, 100 - pct * 5);
    const status: 'good' | 'needs-improvement' | 'critical' = score >= 70 ? 'good' : score >= 40 ? 'needs-improvement' : 'critical';

    return {
      checkId: 'cancellation', name: 'Cancellation Rate',
      category: 'efficiency', score, status,
      finding: `${pct}% of requests were canceled (${canceled} of ${total}).`,
      recommendation: score < 70
        ? 'High cancellation rate suggests prompts may be unclear. Try being more specific in your requests to avoid needing to cancel.'
        : 'Low cancellation rate indicates clear, effective prompting.',
    };
  }

  private checkToolUsageDiversity(sessions: Session[]): RecommendationResult {
    const toolCounts = new Map<string, number>();
    for (const s of sessions) {
      for (const r of s.requests) {
        for (const t of r.toolsUsed) toolCounts.set(t, (toolCounts.get(t) || 0) + 1);
      }
    }
    const uniqueTools = toolCounts.size;
    const score = Math.min(100, uniqueTools * 8);
    const status: 'good' | 'needs-improvement' | 'critical' = score >= 60 ? 'good' : score >= 30 ? 'needs-improvement' : 'critical';

    return {
      checkId: 'tool-diversity', name: 'Tool Usage Diversity',
      category: 'features', score, status,
      finding: `Using ${uniqueTools} different tools. Top: ${[...toolCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(e => e[0]).join(', ')}.`,
      recommendation: score < 60
        ? 'Explore more tools like file search, terminal, and web browsing to enhance your workflow.'
        : 'Good diversity of tool usage.',
    };
  }

  private checkResponseTimeAwareness(sessions: Session[]): RecommendationResult {
    let slowRequests = 0, total = 0;
    const responseTimes: number[] = [];
    for (const s of sessions) {
      for (const r of s.requests) {
        if (r.totalElapsed != null) {
          responseTimes.push(r.totalElapsed);
          total++;
          if (r.totalElapsed > 30000) slowRequests++;
        }
      }
    }
    const avgMs = responseTimes.length > 0
      ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length : 0;
    const slowPct = total > 0 ? Math.round(slowRequests / total * 100) : 0;
    const score = Math.max(0, 100 - slowPct * 3);
    const status: 'good' | 'needs-improvement' | 'critical' = score >= 70 ? 'good' : score >= 40 ? 'needs-improvement' : 'critical';

    return {
      checkId: 'response-time', name: 'Response Time Efficiency',
      category: 'efficiency', score, status,
      finding: `Average response time: ${Math.round(avgMs / 1000)}s. ${slowPct}% of requests took >30s.`,
      recommendation: score < 70
        ? 'Many requests are slow. Break complex prompts into smaller pieces and use faster models for quick tasks.'
        : 'Response times are efficient.',
    };
  }

  private checkFileReferencePatterns(sessions: Session[]): RecommendationResult {
    let withRefs = 0, total = 0;
    for (const s of sessions) {
      for (const r of s.requests) {
        total++;
        if (r.referencedFiles.length > 0 || r.editedFiles.length > 0) withRefs++;
      }
    }
    const pct = total > 0 ? Math.round(withRefs / total * 100) : 0;
    const score = Math.min(100, pct * 2);
    const status: 'good' | 'needs-improvement' | 'critical' = score >= 60 ? 'good' : score >= 30 ? 'needs-improvement' : 'critical';

    return {
      checkId: 'file-refs', name: 'Context Providing',
      category: 'context', score, status,
      finding: `${pct}% of requests include file references or edits for context.`,
      recommendation: score < 60
        ? 'Provide more file context with your requests using #file or @workspace. Better context leads to more accurate responses.'
        : 'Good practice of providing context with file references.',
    };
  }

  private checkSessionLengthOptimization(sessions: Session[]): RecommendationResult {
    const lengths = sessions.map(s => s.requestCount).filter(l => l > 0);
    const avg = lengths.length > 0 ? lengths.reduce((a, b) => a + b, 0) / lengths.length : 0;
    const veryShort = lengths.filter(l => l === 1).length;
    const veryLong = lengths.filter(l => l > 50).length;
    const shortPct = lengths.length > 0 ? Math.round(veryShort / lengths.length * 100) : 0;
    const longPct = lengths.length > 0 ? Math.round(veryLong / lengths.length * 100) : 0;

    let score: number;
    if (shortPct < 30 && longPct < 10 && avg >= 5 && avg <= 25) score = 85;
    else if (shortPct < 50 && longPct < 20) score = 55;
    else score = 25;

    const status: 'good' | 'needs-improvement' | 'critical' = score >= 70 ? 'good' : score >= 40 ? 'needs-improvement' : 'critical';

    return {
      checkId: 'session-length', name: 'Session Length Optimization',
      category: 'workflow', score, status,
      finding: `Average session: ${Math.round(avg)} messages. Single-message: ${shortPct}%. Very long (50+): ${longPct}%.`,
      recommendation: score < 70
        ? 'Aim for sessions of 5-25 messages. Too short means you\'re not leveraging conversation history. Too long means degraded context quality.'
        : 'Good session length distribution.',
    };
  }
}

function getISOWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}
