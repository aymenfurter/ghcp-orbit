/* Timeline page – parallel swim-lane Gantt + Compact views */
import { COLORS, fmtTime, fmtNum, getGlobalWorkspace } from '../app';

const WORK_TYPE_COLORS: Record<string, string> = {
  'feature': '#58a6ff', 'bug fix': '#f85149', 'refactor': '#d29922',
  'code review': '#da7756', 'docs': '#3fb950', 'test': '#bc8cff', 'style': '#f778ba',
  'config': '#79c0ff', 'other': '#8b949e',
};

let currentDate = '';
let currentMode = 'day';
let viewMode: 'compact' | 'gantt' = 'compact';
let lastData: any = null;

export async function renderTimeline(container: HTMLElement): Promise<void> {
  const activity = await window.orbit.getTimelineActivity(getGlobalWorkspace() || undefined);

  if (!currentDate && activity?.labels?.length) {
    currentDate = activity.labels[activity.labels.length - 1];
  }
  if (!currentDate) currentDate = new Date().toLocaleDateString('en-CA');

  container.innerHTML = `
    <div class="page-header">
      <h1>Timeline</h1>
      <p>Parallel session view &mdash; see how you multi-task across workspaces</p>
    </div>
    <div class="card" style="padding:12px 16px;margin-bottom:16px;">
      <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap;">
        <div class="pills" id="mode-pills" style="margin-bottom:0">
          <button class="pill ${currentMode === 'day' ? 'active' : ''}" data-mode="day">Day</button>
          <button class="pill ${currentMode === 'week' ? 'active' : ''}" data-mode="week">Week</button>
          <button class="pill ${currentMode === 'month' ? 'active' : ''}" data-mode="month">Month</button>
        </div>
        <input type="date" id="date-input" value="${currentDate}">
        <div style="flex:1"></div>
        <div class="pills" id="view-pills" style="margin-bottom:0">
          <button class="pill ${viewMode === 'compact' ? 'active' : ''}" data-view="compact">Compact</button>
          <button class="pill ${viewMode === 'gantt' ? 'active' : ''}" data-view="gantt">Gantt</button>
        </div>
        <div style="display:flex;gap:4px;">
          <button class="pill" id="btn-prev">&larr; Prev</button>
          <button class="pill" id="btn-next">Next &rarr;</button>
        </div>
      </div>
    </div>
    <div id="timeline-content">
      <div class="loading-inline"><div class="loading-spinner"></div>Loading...</div>
    </div>
  `;

  container.querySelectorAll('#mode-pills .pill').forEach(btn => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('#mode-pills .pill').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentMode = btn.getAttribute('data-mode') || 'day';
      loadTimeline();
    });
  });

  container.querySelectorAll('#view-pills .pill').forEach(btn => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('#view-pills .pill').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      viewMode = (btn.getAttribute('data-view') || 'compact') as 'compact' | 'gantt';
      if (lastData) renderContent(lastData);
    });
  });

  document.getElementById('date-input')?.addEventListener('change', (e) => {
    currentDate = (e.target as HTMLInputElement).value;
    loadTimeline();
  });

  document.getElementById('btn-prev')?.addEventListener('click', () => navigate('prev'));
  document.getElementById('btn-next')?.addEventListener('click', () => navigate('next'));

  await loadTimeline();
}

function navigate(dir: string) {
  if (!lastData) return;
  const target = dir === 'prev' ? lastData.prevDay : lastData.nextDay;
  if (target) {
    currentDate = target;
    const dateInput = document.getElementById('date-input') as HTMLInputElement;
    if (dateInput) dateInput.value = currentDate;
    loadTimeline();
  }
}

async function loadTimeline() {
  const el = document.getElementById('timeline-content');
  if (!el) return;
  el.innerHTML = '<div class="loading-inline"><div class="loading-spinner"></div>Loading...</div>';

  const data = await window.orbit.getDayTimeline(currentDate, currentMode, getGlobalWorkspace() || undefined);
  lastData = data;

  if (!data || !data.sessions || data.sessions.length === 0) {
    el.innerHTML = `
      <div class="empty-state">
        <h3>No activity</h3>
        <p>No sessions found for ${data?.rangeLabel || currentDate}</p>
        ${data?.firstDay ? `<button class="pill mt-16" id="btn-first">Go to first day (${data.firstDay})</button>` : ''}
      </div>
    `;
    document.getElementById('btn-first')?.addEventListener('click', () => {
      if (data.firstDay) {
        currentDate = data.firstDay;
        const dateInput = document.getElementById('date-input') as HTMLInputElement;
        if (dateInput) dateInput.value = currentDate;
        loadTimeline();
      }
    });
    return;
  }

  renderContent(data);
}

function renderContent(data: any) {
  const el = document.getElementById('timeline-content');
  if (!el) return;

  const sessions = data.sessions as any[];
  const totalReqs = sessions.reduce((a: number, s: any) => a + s.requestCount, 0);
  const totalLoc = sessions.reduce((a: number, s: any) => a + s.requests.reduce((b: number, r: any) => b + (r.loc || 0), 0), 0);
  const maxConc = data.maxConcurrent || 1;
  const concLabel = maxConc >= 4 ? 'Heavy multi-tasking' : maxConc >= 2 ? 'Multi-tasking' : 'Focused';

  // Compute parallel work ratio (time spent with concurrency >= 2 / total active time)
  const allTimes = sessions.flatMap((s: any) => [s.firstActivity, s.lastActivity]);
  const minT = Math.min(...allTimes);
  const maxT = Math.max(...allTimes);
  const bucketMs = 60000; // 1min buckets for parallel calculation
  const totalBuckets = Math.max(1, Math.ceil((maxT - minT) / bucketMs));
  const concBuckets = new Array(totalBuckets).fill(0);
  for (const s of sessions) {
    const sb = Math.floor((s.firstActivity - minT) / bucketMs);
    const eb = Math.ceil((s.lastActivity - minT) / bucketMs);
    for (let b = Math.max(0, sb); b < Math.min(totalBuckets, eb); b++) concBuckets[b]++;
  }
  const activeBuckets = concBuckets.filter(c => c > 0).length;
  const parallelBuckets = concBuckets.filter(c => c >= 2).length;
  const parallelPct = activeBuckets > 0 ? Math.round(parallelBuckets / activeBuckets * 100) : 0;

  // Build unique workspace color map
  const wsNames = [...new Set(sessions.map((s: any) => s.workspaceName))];
  const wsColorMap: Record<string, string> = {};
  wsNames.forEach((ws, i) => { wsColorMap[ws] = COLORS[i % COLORS.length]; });

  // Collect work types used
  const usedWorkTypes = [...new Set(sessions.map((s: any) => s.dominantWorkType || 'other'))];

  el.innerHTML = `
    <div class="stats-row mb-16">
      <div class="stat-card">
        <div class="stat-label">Sessions</div>
        <div class="stat-value">${data.sessionCount}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Max Concurrent</div>
        <div class="stat-value">${maxConc}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Total Messages</div>
        <div class="stat-value">${totalReqs}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Focus Mode</div>
        <div class="stat-value">${concLabel}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Parallel Work</div>
        <div class="stat-value">${parallelPct}%</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">LoC Produced</div>
        <div class="stat-value green">${fmtNum(totalLoc)}</div>
      </div>
    </div>

    <div class="card">
      <div class="flex-between mb-8">
        <div class="card-title">${esc(data.rangeLabel)}</div>
        <div id="gantt-legend" style="display:flex;gap:12px;flex-wrap:wrap;align-items:center;font-size:11px;"></div>
      </div>
      <div id="gantt-container"></div>
    </div>

    <div id="tl-tooltip" style="display:none;position:fixed;z-index:50;pointer-events:none;background:var(--bg-overlay);border:1px solid var(--border-default);border-radius:6px;padding:8px 12px;font-size:11px;max-width:350px;box-shadow:0 4px 12px rgba(0,0,0,0.4);"></div>

    <div class="card" id="session-detail-panel" style="display:none">
      <div class="flex-between mb-8">
        <div class="card-title" id="detail-title"></div>
        <button class="pill" id="btn-close-detail">Close</button>
      </div>
      <div id="detail-content"></div>
    </div>
  `;

  document.getElementById('btn-close-detail')?.addEventListener('click', () => {
    const panel = document.getElementById('session-detail-panel');
    if (panel) panel.style.display = 'none';
  });

  // Render legend
  const legendEl = document.getElementById('gantt-legend');
  if (legendEl) {
    let legendHtml = '';
    // Work type colors (primary legend)
    for (const wt of usedWorkTypes) {
      const c = WORK_TYPE_COLORS[wt] || '#8b949e';
      legendHtml += `<span style="display:inline-flex;align-items:center;gap:4px;"><span style="width:10px;height:10px;border-radius:2px;background:${c};opacity:0.6;flex-shrink:0;"></span>${esc(wt)}</span>`;
    }
    // Dot legend
    legendHtml += `<span style="display:inline-flex;align-items:center;gap:4px;margin-left:8px;"><span style="width:6px;height:6px;border-radius:50%;background:var(--accent-green);"></span>code produced</span>`;
    legendHtml += `<span style="display:inline-flex;align-items:center;gap:4px;"><span style="width:4px;height:4px;border-radius:50%;background:var(--fg-muted);"></span>message</span>`;
    legendEl.innerHTML = legendHtml;
  }

  renderGantt(data, wsColorMap);
}

// ── Active segment compression ──
// Finds contiguous active blocks (with padding) and compresses gaps of inactivity
interface Segment { start: number; end: number; }

function computeActiveSegments(sessions: any[], paddingMs: number, minGapMs: number): Segment[] {
  if (!sessions.length) return [];
  const intervals: Segment[] = sessions.map(s => ({
    start: s.firstActivity - paddingMs,
    end: s.lastActivity + paddingMs,
  }));
  intervals.sort((a, b) => a.start - b.start);

  const merged: Segment[] = [{ ...intervals[0] }];
  for (let i = 1; i < intervals.length; i++) {
    const last = merged[merged.length - 1];
    if (intervals[i].start <= last.end + minGapMs) {
      last.end = Math.max(last.end, intervals[i].end);
    } else {
      merged.push({ ...intervals[i] });
    }
  }
  return merged;
}

function buildTimeMapper(segments: Segment[]) {
  // Compute total active time
  let totalActive = 0;
  for (const seg of segments) totalActive += seg.end - seg.start;

  // Map a timestamp to a normalized 0..1 position, compressing out gaps
  return {
    totalActive,
    map: (ts: number): number => {
      let offset = 0;
      for (const seg of segments) {
        if (ts <= seg.start) return offset / totalActive;
        if (ts <= seg.end) return (offset + ts - seg.start) / totalActive;
        offset += seg.end - seg.start;
      }
      return 1;
    },
    segments,
  };
}

function renderGantt(data: any, wsColorMap: Record<string, string>) {
  const container = document.getElementById('gantt-container');
  if (!container) return;

  const sessions = data.sessions as any[];
  if (!sessions.length) return;

  // Measure container width
  const containerWidth = container.clientWidth || 800;
  const LABEL_W = Math.min(160, containerWidth * 0.18);
  const CHART_W = containerWidth - LABEL_W - 8;

  const LANE_H = 32;
  const LANE_GAP = 3;
  const AXIS_H = 24;
  const STRIP_H = 24;
  const GAP_MARKER_W = 16;

  // Determine active segments for gap compression
  const hourMs = 3600000;
  const paddingMs = currentMode === 'day' ? hourMs * 0.5 : hourMs * 2;
  const minGapMs = currentMode === 'day' ? hourMs * 1.5 : hourMs * 4;
  const segments = computeActiveSegments(sessions, paddingMs, minGapMs);
  const mapper = buildTimeMapper(segments);

  const xOf = (ts: number) => mapper.map(ts) * CHART_W;

  // Assign lanes based on view mode
  let laneCount: number;
  const sessionLanes: number[] = new Array(sessions.length);

  if (viewMode === 'gantt') {
    // Gantt: one row per session
    laneCount = sessions.length;
    for (let i = 0; i < sessions.length; i++) sessionLanes[i] = i;
  } else {
    // Compact: pack sessions into minimum lanes (Final Cut Pro style)
    const lanes: { end: number }[][] = [];
    const sorted = sessions.map((s: any, i: number) => ({ s, i }))
      .sort((a: any, b: any) => a.s.firstActivity - b.s.firstActivity);

    for (const { s, i } of sorted) {
      let placed = false;
      for (let lane = 0; lane < lanes.length; lane++) {
        const last = lanes[lane][lanes[lane].length - 1];
        if (s.firstActivity >= last.end + 60000) {
          lanes[lane].push({ end: s.lastActivity });
          sessionLanes[i] = lane;
          placed = true;
          break;
        }
      }
      if (!placed) {
        lanes.push([{ end: s.lastActivity }]);
        sessionLanes[i] = lanes.length - 1;
      }
    }
    laneCount = lanes.length;
  }

  const lanesTopY = AXIS_H;
  const lanesH = laneCount * (LANE_H + LANE_GAP);
  const concStripY = lanesTopY + lanesH + 6;
  const locStripY = concStripY + STRIP_H + 4;
  const totalH = locStripY + STRIP_H + 8;

  // Build time axis tick marks
  const tickInterval = currentMode === 'day' ? hourMs : currentMode === 'week' ? hourMs * 6 : hourMs * 24;
  const ticks: { ts: number; x: number; label: string }[] = [];
  for (const seg of segments) {
    const segStart = Math.ceil(seg.start / tickInterval) * tickInterval;
    for (let t = segStart; t <= seg.end; t += tickInterval) {
      const x = xOf(t);
      if (x >= 0 && x <= CHART_W) {
        const d = new Date(t);
        let label: string;
        if (currentMode === 'day') {
          label = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
        } else {
          label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
          if (currentMode === 'week') {
            label += ' ' + d.toLocaleTimeString('en-US', { hour: '2-digit', hour12: false });
          }
        }
        // Avoid duplicate positions
        if (!ticks.length || Math.abs(ticks[ticks.length - 1].x - x) > 30) {
          ticks.push({ ts: t, x, label });
        }
      }
    }
  }

  let html = `<div style="position:relative;width:100%;height:${totalH}px;user-select:none;">`;

  // Time axis
  html += `<div style="position:absolute;left:${LABEL_W}px;top:0;width:${CHART_W}px;height:${AXIS_H}px;">`;
  for (const tick of ticks) {
    html += `<span style="position:absolute;left:${tick.x}px;top:3px;font-size:9px;color:var(--fg-subtle);transform:translateX(-50%);white-space:nowrap">${tick.label}</span>`;
  }
  html += '</div>';

  // Gap markers between segments
  if (segments.length > 1) {
    for (let i = 0; i < segments.length - 1; i++) {
      const gapX = LABEL_W + xOf(segments[i].end) - GAP_MARKER_W / 2;
      html += `<div style="position:absolute;left:${gapX}px;top:${AXIS_H}px;width:${GAP_MARKER_W}px;height:${lanesH}px;display:flex;align-items:center;justify-content:center;z-index:5;">
        <svg width="12" height="16" viewBox="0 0 12 16" fill="none" stroke="var(--fg-subtle)" stroke-width="1.5" opacity="0.5">
          <path d="M3 0 L3 6 L9 10 L9 16"/><path d="M9 0 L9 6 L3 10 L3 16"/>
        </svg>
      </div>`;
    }
  }

  // Lane backgrounds + grid lines
  for (let lane = 0; lane < laneCount; lane++) {
    const y = lanesTopY + lane * (LANE_H + LANE_GAP);
    html += `<div style="position:absolute;left:${LABEL_W}px;top:${y}px;width:${CHART_W}px;height:${LANE_H}px;background:var(--bg-subtle);border-radius:3px;"></div>`;
  }
  for (const tick of ticks) {
    const x = LABEL_W + tick.x;
    html += `<div style="position:absolute;left:${x}px;top:${AXIS_H}px;width:1px;height:${lanesH}px;background:var(--border-muted);opacity:0.3;"></div>`;
  }

  // Session bars
  for (let i = 0; i < sessions.length; i++) {
    const s = sessions[i];
    const lane = sessionLanes[i];
    const y = lanesTopY + lane * (LANE_H + LANE_GAP);
    const color = WORK_TYPE_COLORS[s.dominantWorkType] || WORK_TYPE_COLORS['other'];

    const barStart = xOf(s.firstActivity);
    const barEnd = xOf(s.lastActivity);
    const barWidth = Math.max(4, barEnd - barStart);

    // Label (left side) — only for gantt mode (one label per row)
    if (viewMode === 'gantt') {
      const labelText = s.workspaceName.length > 18 ? s.workspaceName.slice(0, 17) + '\u2026' : s.workspaceName;
      html += `<div style="position:absolute;left:0;top:${y}px;width:${LABEL_W - 6}px;height:${LANE_H}px;display:flex;align-items:center;justify-content:flex-end;padding-right:6px;">
        <span style="font-size:10px;color:var(--fg-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:${LABEL_W - 12}px;" title="${esc(s.workspaceName)}">${esc(labelText)}</span>
      </div>`;
    }

    // Bar — colored by work type
    html += `<div class="gantt-bar" data-idx="${i}"
      style="position:absolute;left:${LABEL_W + barStart}px;top:${y + 4}px;width:${barWidth}px;height:${LANE_H - 8}px;
        background:${color}33;border:1px solid ${color}77;border-radius:3px;cursor:pointer;
        overflow:hidden;transition:background 0.15s;">`;

    // Request dots inside bar
    const span = s.lastActivity - s.firstActivity || 1;
    for (const r of s.requests) {
      const rx = ((r.timestamp - s.firstActivity) / span) * (barWidth - 4);
      if (rx >= 0 && rx <= barWidth - 4) {
        const hasLoc = r.loc > 0;
        const dotSize = hasLoc ? 5 : 3;
        const dotColor = hasLoc ? 'var(--accent-green)' : color;
        html += `<div style="position:absolute;left:${2 + rx}px;top:50%;width:${dotSize}px;height:${dotSize}px;margin-top:-${dotSize / 2}px;border-radius:50%;background:${dotColor};opacity:0.7;"></div>`;
      }
    }

    html += '</div>';
  }

  // Compact mode — lane labels (show the first session's workspace per lane)
  if (viewMode === 'compact') {
    const laneLabels: Map<number, string[]> = new Map();
    for (let i = 0; i < sessions.length; i++) {
      const lane = sessionLanes[i];
      if (!laneLabels.has(lane)) laneLabels.set(lane, []);
      const names = laneLabels.get(lane)!;
      if (!names.includes(sessions[i].workspaceName)) names.push(sessions[i].workspaceName);
    }
    for (const [lane, names] of laneLabels) {
      const y = lanesTopY + lane * (LANE_H + LANE_GAP);
      const label = names.length <= 2 ? names.join(', ') : names[0] + ` +${names.length - 1}`;
      const truncLabel = label.length > 18 ? label.slice(0, 17) + '\u2026' : label;
      html += `<div style="position:absolute;left:0;top:${y}px;width:${LABEL_W - 6}px;height:${LANE_H}px;display:flex;align-items:center;justify-content:flex-end;padding-right:6px;">
        <span style="font-size:10px;color:var(--fg-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:${LABEL_W - 12}px;" title="${esc(names.join(', '))}">${esc(truncLabel)}</span>
      </div>`;
    }
  }

  // Concurrency strip
  html += renderStrip(sessions, mapper, LABEL_W, CHART_W, concStripY, STRIP_H, 'concurrency', 'conc');
  // LoC strip
  html += renderStrip(sessions, mapper, LABEL_W, CHART_W, locStripY, STRIP_H, 'lines of code', 'loc');

  html += '</div>';
  container.innerHTML = html;

  // Event handlers
  const tooltip = document.getElementById('tl-tooltip');
  container.querySelectorAll('.gantt-bar').forEach(bar => {
    bar.addEventListener('click', () => {
      const idx = parseInt(bar.getAttribute('data-idx') || '0', 10);
      showSessionDetail(sessions[idx]);
    });
    bar.addEventListener('mouseenter', (evt) => {
      const idx = parseInt(bar.getAttribute('data-idx') || '0', 10);
      const color = WORK_TYPE_COLORS[sessions[idx].dominantWorkType] || WORK_TYPE_COLORS['other'];
      (bar as HTMLElement).style.background = color + '55';
      showTooltip(evt as MouseEvent, sessions[idx]);
    });
    bar.addEventListener('mousemove', (evt) => {
      moveTooltip(evt as MouseEvent);
    });
    bar.addEventListener('mouseleave', () => {
      const idx = parseInt(bar.getAttribute('data-idx') || '0', 10);
      const color = WORK_TYPE_COLORS[sessions[idx].dominantWorkType] || WORK_TYPE_COLORS['other'];
      (bar as HTMLElement).style.background = color + '33';
      hideTooltip();
    });
  });
}

function renderStrip(sessions: any[], mapper: ReturnType<typeof buildTimeMapper>, labelW: number, chartW: number, topY: number, stripH: number, label: string, mode: 'conc' | 'loc'): string {
  const { totalActive, segments } = mapper;
  const bucketMs = Math.max(60000, totalActive / 120); // ~120 buckets
  const bucketCount = Math.max(1, Math.ceil(totalActive / bucketMs));
  const values = new Array(bucketCount).fill(0);

  // Map sessions into active-time-space buckets
  for (const s of sessions) {
    const sStart = mapper.map(s.firstActivity) * totalActive;
    const sEnd = mapper.map(s.lastActivity) * totalActive;
    const sb = Math.floor(sStart / bucketMs);
    const eb = Math.ceil(sEnd / bucketMs);

    if (mode === 'conc') {
      for (let b = Math.max(0, sb); b < Math.min(bucketCount, eb); b++) values[b]++;
    } else {
      // LoC: distribute total session LoC evenly across its buckets
      const sessionLoc = s.requests.reduce((a: number, r: any) => a + (r.loc || 0), 0);
      const numBuckets = Math.max(1, eb - sb);
      const locPerBucket = sessionLoc / numBuckets;
      for (let b = Math.max(0, sb); b < Math.min(bucketCount, eb); b++) values[b] += locPerBucket;
    }
  }

  const maxVal = Math.max(...values, 1);
  const bw = chartW / bucketCount;

  let html = `<div style="position:absolute;left:0;top:${topY}px;width:${labelW - 6}px;height:${stripH}px;display:flex;align-items:center;justify-content:flex-end;padding-right:6px;">
    <span style="font-size:9px;color:var(--fg-subtle);">${label}</span>
  </div>`;
  html += `<div style="position:absolute;left:${labelW}px;top:${topY}px;width:${chartW}px;height:${stripH}px;display:flex;align-items:flex-end;">`;
  for (let b = 0; b < bucketCount; b++) {
    const h = Math.max(0, (values[b] / maxVal) * stripH);
    let color: string;
    if (mode === 'conc') {
      color = values[b] >= 4 ? 'var(--accent-purple)' : values[b] >= 2 ? 'var(--accent-blue)' : 'var(--accent-green)';
    } else {
      color = values[b] > 0 ? 'var(--accent-green)' : 'transparent';
    }
    const opacity = mode === 'conc' ? 0.35 : 0.5;
    html += `<div style="width:${bw}px;height:${h}px;background:${color};opacity:${opacity};border-radius:1px 1px 0 0;" title="${mode === 'conc' ? 'Concurrency: ' + values[b] : 'LoC: ' + Math.round(values[b])}"></div>`;
  }
  html += '</div>';
  return html;
}

function showTooltip(evt: MouseEvent, session: any) {
  const tip = document.getElementById('tl-tooltip');
  if (!tip) return;

  const dur = session.lastActivity - session.firstActivity;
  const durStr = dur < 60000 ? '<1m' : dur < 3600000 ? `${Math.round(dur / 60000)}m` : `${(dur / 3600000).toFixed(1)}h`;
  const sessionLoc = session.requests.reduce((a: number, r: any) => a + (r.loc || 0), 0);

  tip.innerHTML = `
    <div style="font-weight:600;color:var(--fg-default);margin-bottom:4px;">${esc(session.workspaceName)}</div>
    <div style="color:var(--fg-muted);margin-bottom:4px;font-style:italic;">${esc(session.sessionName || session.requests[0]?.preview || '')}</div>
    <div style="color:var(--fg-subtle);">
      ${fmtTime(session.firstActivity)} – ${fmtTime(session.lastActivity)} (${durStr})<br>
      ${session.requestCount} messages${sessionLoc ? ' · ' + fmtNum(sessionLoc) + ' LoC' : ''}
      ${session.dominantWorkType ? ' · <span style="color:' + (WORK_TYPE_COLORS[session.dominantWorkType] || '#8b949e') + '">' + esc(session.dominantWorkType) + '</span>' : ''}
    </div>
  `;
  tip.style.display = 'block';
  moveTooltip(evt);
}

function moveTooltip(evt: MouseEvent) {
  const tip = document.getElementById('tl-tooltip');
  if (!tip) return;
  tip.style.left = (evt.clientX + 12) + 'px';
  tip.style.top = (evt.clientY - 10) + 'px';
}

function hideTooltip() {
  const tip = document.getElementById('tl-tooltip');
  if (tip) tip.style.display = 'none';
}

function showSessionDetail(session: any) {
  const panel = document.getElementById('session-detail-panel');
  const titleEl = document.getElementById('detail-title');
  const contentEl = document.getElementById('detail-content');
  if (!panel || !titleEl || !contentEl) return;

  panel.style.display = 'block';
  titleEl.textContent = session.workspaceName;

  const startTime = fmtTime(session.firstActivity);
  const endTime = fmtTime(session.lastActivity);
  const dur = session.lastActivity - session.firstActivity;
  const durStr = dur < 60000 ? '<1m' : dur < 3600000 ? `${Math.round(dur / 60000)}m` : `${(dur / 3600000).toFixed(1)}h`;

  let html = `
    <div class="session-meta mb-8">
      <span>${startTime} — ${endTime}</span>
      <span>Duration: ${durStr}</span>
      <span>${session.requestCount} messages</span>
    </div>
    <div class="text-sm text-muted mb-16" style="font-style:italic">${esc(session.sessionName || '')}</div>
    <div style="padding-left:12px;border-left:2px solid var(--border-muted)">
  `;

  for (const r of session.requests) {
    const time = fmtTime(r.timestamp);
    const tools = r.toolsUsed?.length ? `<span class="badge blue">${r.toolsUsed.length} tools</span>` : '';
    const loc = r.loc ? `<span class="badge green">${r.loc} LoC</span>` : '';
    const model = r.modelId ? `<span class="badge">${r.modelId.split('/').pop()}</span>` : '';
    html += `
      <div style="padding:5px 0;font-size:12px">
        <span class="text-mono text-subtle">${time}</span>
        <span class="text-muted" style="margin-left:8px">${esc(r.preview || r.messageText?.slice(0, 80) || '')}</span>
        ${model} ${tools} ${loc}
      </div>
    `;
  }

  html += '</div>';
  contentEl.innerHTML = html;
  panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function esc(str: string): string {
  const el = document.createElement('span');
  el.textContent = str;
  return el.innerHTML;
}
