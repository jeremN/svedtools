import { describe, it, expect } from 'vitest';
import { isDevToolsMessage, PROTOCOL_VERSION } from './protocol.js';

describe('isDevToolsMessage', () => {
  it('returns true for valid bridge-to-panel message', () => {
    expect(
      isDevToolsMessage({
        source: 'svelte-devtools-pro',
        payload: { type: 'component:mounted', node: {} },
      }),
    ).toBe(true);
  });

  it('returns true for valid panel-to-bridge message', () => {
    expect(
      isDevToolsMessage({
        source: 'svelte-devtools-pro',
        payload: { type: 'inspect:component', id: 'sdt-1' },
      }),
    ).toBe(true);
  });

  it('returns false for wrong source', () => {
    expect(
      isDevToolsMessage({
        source: 'other-extension',
        payload: { type: 'component:mounted' },
      }),
    ).toBe(false);
  });

  it('returns false for missing source', () => {
    expect(isDevToolsMessage({ payload: { type: 'component:mounted' } })).toBe(false);
  });

  it('returns false for null', () => {
    expect(isDevToolsMessage(null)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isDevToolsMessage(undefined)).toBe(false);
  });

  it('returns false for string', () => {
    expect(isDevToolsMessage('hello')).toBe(false);
  });

  it('returns false for number', () => {
    expect(isDevToolsMessage(42)).toBe(false);
  });

  it('returns false for missing payload', () => {
    expect(isDevToolsMessage({ source: 'svelte-devtools-pro' })).toBe(false);
  });

  it('returns false for null payload', () => {
    expect(isDevToolsMessage({ source: 'svelte-devtools-pro', payload: null })).toBe(false);
  });

  it('returns false for payload without type', () => {
    expect(
      isDevToolsMessage({
        source: 'svelte-devtools-pro',
        payload: { id: 'sdt-1' },
      }),
    ).toBe(false);
  });

  it('returns false for unknown message type', () => {
    expect(
      isDevToolsMessage({
        source: 'svelte-devtools-pro',
        payload: { type: 'unknown:message' },
      }),
    ).toBe(false);
  });

  it('returns false for numeric type', () => {
    expect(
      isDevToolsMessage({
        source: 'svelte-devtools-pro',
        payload: { type: 42 },
      }),
    ).toBe(false);
  });

  it('validates all bridge-to-panel message types', () => {
    const bridgeTypes = [
      'component:mounted',
      'component:unmounted',
      'component:updated',
      'component:tree',
      'state:snapshot',
      'graph:snapshot',
      'graph:update',
      'profiler:data',
      'trace:update',
      'bridge:ready',
    ];
    for (const type of bridgeTypes) {
      expect(
        isDevToolsMessage({
          source: 'svelte-devtools-pro',
          payload: { type },
        }),
      ).toBe(true);
    }
  });

  it('validates all panel-to-bridge message types', () => {
    const panelTypes = [
      'inspect:component',
      'state:edit',
      'profiler:start',
      'profiler:stop',
      'graph:request',
      'highlight:component',
      'open-in-editor',
    ];
    for (const type of panelTypes) {
      expect(
        isDevToolsMessage({
          source: 'svelte-devtools-pro',
          payload: { type },
        }),
      ).toBe(true);
    }
  });
});

describe('PROTOCOL_VERSION', () => {
  it('is a positive integer', () => {
    expect(PROTOCOL_VERSION).toBeGreaterThan(0);
    expect(Number.isInteger(PROTOCOL_VERSION)).toBe(true);
  });
});
