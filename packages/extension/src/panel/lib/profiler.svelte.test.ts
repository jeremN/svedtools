import { describe, it, expect, beforeEach, vi } from 'vitest';

const { sendMock } = vi.hoisted(() => ({ sendMock: vi.fn() }));
vi.mock('./connection.svelte.js', () => ({ send: sendMock }));

import {
  startRecording,
  stopRecording,
  clearData,
  processProfilerMessage,
  getIsRecording,
  getRenderTimings,
  getEffectTimings,
  getRecordingStartTime,
  getComponentStats,
  getEffectStats,
  resetProfilerState,
} from './profiler.svelte.js';
import { processMessage, resetState } from './components.svelte.js';
import type { RenderTiming, ComponentNode } from '@svelte-devtools/shared';

function renderTiming(overrides: Partial<RenderTiming> = {}): RenderTiming {
  return {
    componentId: 'c1',
    name: 'Counter',
    startTime: 0,
    duration: 1,
    isRerender: false,
    ...overrides,
  };
}

function effectTiming(
  overrides: Partial<{
    effectId: string;
    label: string | null;
    componentId: string | null;
    componentName: string | null;
    duration: number;
    depsCount: number;
  }> = {},
) {
  return {
    effectId: 'e1',
    label: 'log',
    componentId: null,
    componentName: null,
    duration: 1,
    depsCount: 1,
    ...overrides,
  };
}

function componentNode(overrides: Partial<ComponentNode> = {}): ComponentNode {
  return {
    id: 'c1',
    name: 'Counter',
    filename: 'Counter.svelte',
    children: [],
    parentId: null,
    meta: null,
    stateIds: [],
    effectIds: [],
    renderDuration: null,
    ...overrides,
  };
}

describe('profiler store', () => {
  beforeEach(() => {
    sendMock.mockClear();
    resetProfilerState();
    resetState();
  });

  describe('startRecording / stopRecording / clearData', () => {
    it('startRecording flips isRecording, clears timings, and sends profiler:start', () => {
      startRecording();
      expect(getIsRecording()).toBe(true);
      expect(getRenderTimings()).toEqual([]);
      expect(getEffectTimings()).toEqual([]);
      expect(getRecordingStartTime()).not.toBeNull();
      expect(sendMock).toHaveBeenCalledWith({ type: 'profiler:start' });
    });

    it('stopRecording flips isRecording off and sends profiler:stop', () => {
      startRecording();
      sendMock.mockClear();
      stopRecording();
      expect(getIsRecording()).toBe(false);
      expect(sendMock).toHaveBeenCalledWith({ type: 'profiler:stop' });
    });

    it('clearData empties timings while not recording', () => {
      startRecording();
      stopRecording();
      processProfilerMessage({
        type: 'profiler:data',
        timings: [renderTiming()],
        effectTimings: [effectTiming()],
      });
      expect(getRenderTimings()).toHaveLength(1);

      clearData();
      expect(getRenderTimings()).toEqual([]);
      expect(getEffectTimings()).toEqual([]);
      expect(getRecordingStartTime()).toBeNull();
    });

    it('clearData is a no-op while recording', () => {
      startRecording();
      // No stop/data yet — renderTimings already empty, but recordingStartTime is set.
      const startTime = getRecordingStartTime();
      clearData();
      expect(getRecordingStartTime()).toBe(startTime);
    });
  });

  describe('profiler:data aggregation', () => {
    it('merges timings into component and effect stats', () => {
      startRecording();
      stopRecording();
      processProfilerMessage({
        type: 'profiler:data',
        timings: [
          renderTiming({ componentId: 'c1', name: 'Counter', duration: 2 }),
          renderTiming({ componentId: 'c1', name: 'Counter', duration: 4 }),
          renderTiming({ componentId: 'c2', name: 'TodoList', duration: 10 }),
        ],
        effectTimings: [
          effectTiming({ effectId: 'e1', label: 'log', duration: 1 }),
          effectTiming({ effectId: 'e1', label: null, duration: 3 }),
        ],
      });

      const componentStats = getComponentStats();
      const counterStats = componentStats.find((s) => s.name === 'Counter');
      expect(counterStats).toEqual({ name: 'Counter', renderCount: 2, totalTime: 6, avgTime: 3, maxTime: 4 });

      // Sorted by totalTime descending — TodoList (10) before Counter (6).
      expect(componentStats.map((s) => s.name)).toEqual(['TodoList', 'Counter']);

      const effectStats = getEffectStats();
      expect(effectStats).toEqual([
        {
          effectId: 'e1',
          label: 'log',
          componentId: null,
          componentName: null,
          execCount: 2,
          totalDuration: 4,
          avgDuration: 2,
        },
      ]);
    });

    it('carries componentId/componentName through and backfills a null-then-set sequence', () => {
      startRecording();
      stopRecording();
      processProfilerMessage({
        type: 'profiler:data',
        timings: [],
        effectTimings: [
          effectTiming({ effectId: 'e1', label: 'log', componentId: null, componentName: null, duration: 1 }),
          effectTiming({ effectId: 'e1', label: 'log', componentId: 'c1', componentName: 'Counter', duration: 2 }),
        ],
      });

      const effectStats = getEffectStats();
      expect(effectStats).toEqual([
        {
          effectId: 'e1',
          label: 'log',
          componentId: 'c1',
          componentName: 'Counter',
          execCount: 2,
          totalDuration: 3,
          avgDuration: 1.5,
        },
      ]);
    });

    it('attribution is frozen at record time — component-map churn cannot rewrite it', () => {
      startRecording();
      stopRecording();
      processProfilerMessage({
        type: 'profiler:data',
        timings: [],
        effectTimings: [
          effectTiming({ effectId: 'e1', label: null, componentId: 'sdt-1', componentName: 'EffectChain' }),
        ],
      });
      expect(getEffectStats()[0].componentName).toBe('EffectChain');

      // Page reload scenario: the bridge's id counter restarts and a DIFFERENT
      // component inherits the recycled id 'sdt-1' in the live component map.
      processMessage({
        type: 'component:tree',
        nodes: [componentNode({ id: 'sdt-1', name: 'Impostor' })],
      });

      // The recorded stats must keep the name frozen at record time.
      expect(getEffectStats()[0].componentName).toBe('EffectChain');
    });

    it('isRecording is set to false once data lands', () => {
      startRecording();
      stopRecording();
      processProfilerMessage({ type: 'profiler:data', timings: [], effectTimings: [] });
      expect(getIsRecording()).toBe(false);
    });
  });

  describe('ignoring non profiler:data messages', () => {
    it('does not touch state for other message types', () => {
      startRecording();
      stopRecording();
      processProfilerMessage({ type: 'bridge:ready', svelteVersion: '5.0.0', protocolVersion: 1 });
      expect(getRenderTimings()).toEqual([]);
      expect(getIsRecording()).toBe(false);
    });
  });

  describe('stale-session guard (pendingStopToken / sessionToken)', () => {
    it('accepts profiler:data that arrives after the matching stopRecording()', () => {
      startRecording();
      stopRecording();
      processProfilerMessage({
        type: 'profiler:data',
        timings: [renderTiming({ name: 'Counter' })],
        effectTimings: [],
      });
      expect(getRenderTimings()).toHaveLength(1);
    });

    it('discards profiler:data that arrives with no stop pending (unexpected/duplicate reply)', () => {
      startRecording();
      stopRecording();
      processProfilerMessage({
        type: 'profiler:data',
        timings: [renderTiming({ name: 'Counter' })],
        effectTimings: [],
      });
      expect(getRenderTimings()).toHaveLength(1);

      // A second, unsolicited profiler:data for the same session (pendingStopToken
      // already consumed back to null) must not be merged again.
      processProfilerMessage({
        type: 'profiler:data',
        timings: [renderTiming({ name: 'Counter' })],
        effectTimings: [],
      });
      expect(getRenderTimings()).toHaveLength(1);
    });

    it('discards stale profiler:data from a previous session once a new session has started (stop-then-start race)', () => {
      // Session 1: start, stop (now waiting on profiler:data for session 1) —
      // but the bridge is slow and the user starts a new recording before it replies.
      startRecording();
      stopRecording();
      startRecording(); // session 2 begins; pendingStopToken is reset to null

      expect(getIsRecording()).toBe(true);
      expect(getRenderTimings()).toEqual([]);

      // The stale session-1 profiler:data finally arrives.
      processProfilerMessage({
        type: 'profiler:data',
        timings: [renderTiming({ name: 'StaleFromSession1' })],
        effectTimings: [],
      });

      // Session 2 must not be polluted by session 1's data, and must still be recording.
      expect(getRenderTimings()).toEqual([]);
      expect(getIsRecording()).toBe(true);
    });

    it('accepts profiler:data for session 2 after the stale session-1 data was discarded', () => {
      startRecording();
      stopRecording();
      startRecording(); // session 2

      // Stale session-1 reply — discarded.
      processProfilerMessage({
        type: 'profiler:data',
        timings: [renderTiming({ name: 'StaleFromSession1' })],
        effectTimings: [],
      });
      expect(getRenderTimings()).toEqual([]);

      // Now stop session 2 for real and let its data land.
      stopRecording();
      processProfilerMessage({
        type: 'profiler:data',
        timings: [renderTiming({ name: 'Session2' })],
        effectTimings: [],
      });

      expect(getRenderTimings()).toHaveLength(1);
      expect(getRenderTimings()[0].name).toBe('Session2');
      expect(getIsRecording()).toBe(false);
    });
  });

  describe('MAX_PANEL_ENTRIES cap', () => {
    it('caps accumulated render/effect timings, keeping the most recent entries', () => {
      startRecording();
      stopRecording();
      const timings = Array.from({ length: 10_001 }, (_, i) => renderTiming({ name: `r${i}` }));
      processProfilerMessage({ type: 'profiler:data', timings, effectTimings: [] });

      const result = getRenderTimings();
      expect(result).toHaveLength(10_000);
      expect(result[0].name).toBe('r1');
      expect(result.at(-1)?.name).toBe('r10000');
    });
  });

  describe('resetProfilerState', () => {
    it('clears recording state and timings', () => {
      startRecording();
      stopRecording();
      processProfilerMessage({ type: 'profiler:data', timings: [renderTiming()], effectTimings: [] });

      resetProfilerState();

      expect(getIsRecording()).toBe(false);
      expect(getRenderTimings()).toEqual([]);
      expect(getEffectTimings()).toEqual([]);
      expect(getRecordingStartTime()).toBeNull();
    });
  });
});
