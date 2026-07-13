import { describe, it, expect, beforeEach } from 'vitest';
import {
  processTraceMessage,
  getTraces,
  getSelectedTraceId,
  getSelectedTrace,
  selectTrace,
  clearTraces,
  resetTracerState,
} from './tracer.svelte.js';
import type { UpdateTrace } from '@svelte-devtools/shared';

function trace(id: string): UpdateTrace {
  return {
    id,
    timestamp: 0,
    rootCause: {
      signalId: 's1',
      signalLabel: 'count',
      componentId: 'c1',
      componentName: 'Counter',
      stackTrace: null,
      oldValue: 0,
      newValue: 1,
    },
    chain: [],
    domMutations: [],
  };
}

describe('tracer store', () => {
  beforeEach(() => {
    resetTracerState();
  });

  it('appends incoming trace:update messages', () => {
    processTraceMessage({ type: 'trace:update', trace: trace('t1') });
    processTraceMessage({ type: 'trace:update', trace: trace('t2') });
    expect(getTraces().map((t) => t.id)).toEqual(['t1', 't2']);
  });

  it('ignores non trace:update messages', () => {
    processTraceMessage({ type: 'bridge:ready', svelteVersion: '5.0.0', protocolVersion: 1 });
    expect(getTraces()).toEqual([]);
  });

  it('evicts the oldest trace once the ring buffer exceeds MAX_TRACES (200)', () => {
    for (let i = 0; i < 200; i++) {
      processTraceMessage({ type: 'trace:update', trace: trace(`t${i}`) });
    }
    expect(getTraces()).toHaveLength(200);
    expect(getTraces()[0].id).toBe('t0');

    // One more push should evict t0 and keep the buffer at 200.
    processTraceMessage({ type: 'trace:update', trace: trace('t200') });
    expect(getTraces()).toHaveLength(200);
    expect(getTraces()[0].id).toBe('t1');
    expect(getTraces().at(-1)?.id).toBe('t200');
  });

  describe('selection', () => {
    it('selectTrace sets the selected id and getSelectedTrace resolves it', () => {
      processTraceMessage({ type: 'trace:update', trace: trace('t1') });
      selectTrace('t1');
      expect(getSelectedTraceId()).toBe('t1');
      expect(getSelectedTrace()?.id).toBe('t1');
    });

    it('getSelectedTrace returns null when nothing is selected', () => {
      expect(getSelectedTrace()).toBeNull();
    });

    it('getSelectedTrace returns null when the selected id is no longer present', () => {
      processTraceMessage({ type: 'trace:update', trace: trace('t1') });
      selectTrace('ghost');
      expect(getSelectedTrace()).toBeNull();
    });
  });

  describe('clearTraces', () => {
    it('empties the buffer and clears selection', () => {
      processTraceMessage({ type: 'trace:update', trace: trace('t1') });
      selectTrace('t1');
      clearTraces();
      expect(getTraces()).toEqual([]);
      expect(getSelectedTraceId()).toBeNull();
    });
  });

  describe('resetTracerState', () => {
    it('clears traces and selection', () => {
      processTraceMessage({ type: 'trace:update', trace: trace('t1') });
      selectTrace('t1');
      resetTracerState();
      expect(getTraces()).toEqual([]);
      expect(getSelectedTraceId()).toBeNull();
    });
  });
});
