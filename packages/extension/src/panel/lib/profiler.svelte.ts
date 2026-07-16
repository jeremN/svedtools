import type { RenderTiming, NodeId, BridgeToPanelMessage } from '@svelte-devtools/shared';
import { send } from './connection.svelte.js';

// -- Types --

export interface EffectTiming {
  effectId: NodeId;
  label: string | null;
  componentId: NodeId | null;
  componentName: string | null;
  duration: number;
  depsCount: number;
}

export interface ComponentStats {
  name: string;
  renderCount: number;
  totalTime: number;
  avgTime: number;
  maxTime: number;
}

export interface EffectStats {
  effectId: NodeId;
  label: string | null;
  componentId: NodeId | null;
  componentName: string | null;
  execCount: number;
  totalDuration: number;
  avgDuration: number;
}

export interface UpdateTiming {
  componentId: NodeId | null;
  componentName: string | null;
  duration: number;
}

export interface UpdateStats {
  componentName: string;
  updateCount: number;
  totalTime: number;
  avgTime: number;
  maxTime: number;
}

// -- Reactive state --

let isRecording: boolean = $state(false);
let renderTimings: RenderTiming[] = $state([]);
let effectTimings: EffectTiming[] = $state([]);
let updateTimings: UpdateTiming[] = $state([]);
let recordingStartTime: number | null = $state(null);
let sessionToken: number = 0;
let pendingStopToken: number | null = null;
const MAX_PANEL_ENTRIES = 10_000;

// -- Exported accessors --

export function getIsRecording(): boolean {
  return isRecording;
}

export function getRenderTimings(): RenderTiming[] {
  return renderTimings;
}

export function getEffectTimings(): EffectTiming[] {
  return effectTimings;
}

export function getUpdateTimings(): UpdateTiming[] {
  return updateTimings;
}

export function getRecordingStartTime(): number | null {
  return recordingStartTime;
}

// -- Derived: aggregated component stats --

export function getComponentStats(): ComponentStats[] {
  // eslint-disable-next-line svelte/prefer-svelte-reactivity
  const map = new Map<string, { name: string; count: number; total: number; max: number }>();

  for (const t of renderTimings) {
    let entry = map.get(t.name);
    if (!entry) {
      entry = { name: t.name, count: 0, total: 0, max: 0 };
      map.set(t.name, entry);
    }
    entry.count++;
    entry.total += t.duration;
    if (t.duration > entry.max) entry.max = t.duration;
  }

  const stats: ComponentStats[] = [];
  for (const [, entry] of map) {
    stats.push({
      name: entry.name,
      renderCount: entry.count,
      totalTime: entry.total,
      avgTime: entry.count > 0 ? entry.total / entry.count : 0,
      maxTime: entry.max,
    });
  }

  // Sort by total time descending
  stats.sort((a, b) => b.totalTime - a.totalTime);
  return stats;
}

// -- Derived: aggregated effect stats --

export function getEffectStats(): EffectStats[] {
  // eslint-disable-next-line svelte/prefer-svelte-reactivity
  const map = new Map<
    NodeId,
    {
      effectId: NodeId;
      label: string | null;
      componentId: NodeId | null;
      componentName: string | null;
      count: number;
      total: number;
    }
  >();

  for (const t of effectTimings) {
    let entry = map.get(t.effectId);
    if (!entry) {
      entry = {
        effectId: t.effectId,
        label: t.label,
        componentId: t.componentId,
        componentName: t.componentName,
        count: 0,
        total: 0,
      };
      map.set(t.effectId, entry);
    }
    entry.count++;
    entry.total += t.duration;
    if (!entry.label && t.label) entry.label = t.label;
    if (!entry.componentId && t.componentId) entry.componentId = t.componentId;
    if (!entry.componentName && t.componentName) entry.componentName = t.componentName;
  }

  const stats: EffectStats[] = [];
  for (const [, entry] of map) {
    stats.push({
      effectId: entry.effectId,
      label: entry.label,
      componentId: entry.componentId,
      componentName: entry.componentName,
      execCount: entry.count,
      totalDuration: entry.total,
      avgDuration: entry.count > 0 ? entry.total / entry.count : 0,
    });
  }

  // Sort by total duration descending
  stats.sort((a, b) => b.totalDuration - a.totalDuration);
  return stats;
}

// -- Derived: aggregated update-cycle stats (template_effect timings) --

export function getUpdateStats(): UpdateStats[] {
  // eslint-disable-next-line svelte/prefer-svelte-reactivity
  const map = new Map<string, { name: string; count: number; total: number; max: number }>();

  for (const t of updateTimings) {
    const key = t.componentName ?? t.componentId ?? '—';
    let entry = map.get(key);
    if (!entry) {
      entry = { name: key, count: 0, total: 0, max: 0 };
      map.set(key, entry);
    }
    entry.count++;
    entry.total += t.duration;
    if (t.duration > entry.max) entry.max = t.duration;
  }

  const stats: UpdateStats[] = [];
  for (const [, entry] of map) {
    stats.push({
      componentName: entry.name,
      updateCount: entry.count,
      totalTime: entry.total,
      avgTime: entry.count > 0 ? entry.total / entry.count : 0,
      maxTime: entry.max,
    });
  }

  // Sort by total time descending
  stats.sort((a, b) => b.totalTime - a.totalTime);
  return stats;
}

// -- Actions --

export function startRecording(): void {
  sessionToken++;
  pendingStopToken = null; // Cancel any pending stop from previous session
  isRecording = true;
  renderTimings = [];
  effectTimings = [];
  updateTimings = [];
  recordingStartTime = Date.now();
  send({ type: 'profiler:start' });
}

export function stopRecording(): void {
  pendingStopToken = sessionToken;
  isRecording = false;
  send({ type: 'profiler:stop' });
}

export function clearData(): void {
  if (isRecording) return;
  renderTimings = [];
  effectTimings = [];
  updateTimings = [];
  recordingStartTime = null;
}

// -- Message processing --

export function processProfilerMessage(message: BridgeToPanelMessage): void {
  if (message.type === 'profiler:data') {
    // Discard stale data from a previous session (stop-then-start race)
    if (pendingStopToken !== sessionToken) return;
    pendingStopToken = null;
    const newRenders = [...renderTimings, ...message.timings];
    const newEffects = [...effectTimings, ...message.effectTimings];
    // Guard against a stale/older bridge that emits profiler:data without
    // the field (pre-plan-017 page still connected to a fresh panel).
    const newUpdates = [...updateTimings, ...(message.updateTimings ?? [])];
    renderTimings = newRenders.length > MAX_PANEL_ENTRIES ? newRenders.slice(-MAX_PANEL_ENTRIES) : newRenders;
    effectTimings = newEffects.length > MAX_PANEL_ENTRIES ? newEffects.slice(-MAX_PANEL_ENTRIES) : newEffects;
    updateTimings = newUpdates.length > MAX_PANEL_ENTRIES ? newUpdates.slice(-MAX_PANEL_ENTRIES) : newUpdates;
    isRecording = false;
  }
}

// -- Reset --

export function resetProfilerState(): void {
  isRecording = false;
  renderTimings = [];
  effectTimings = [];
  updateTimings = [];
  recordingStartTime = null;
}
