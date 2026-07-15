import { describe, it, expect } from 'vitest';
import {
  isValidMessage,
  isTrustedPanelSender,
  isValidPanelMessage,
  VALID_BRIDGE_TYPES,
  VALID_PANEL_TYPES,
} from './service-worker-utils.js';

describe('isValidMessage', () => {
  it('accepts valid bridge message types', () => {
    for (const type of VALID_BRIDGE_TYPES) {
      expect(isValidMessage({ type }, VALID_BRIDGE_TYPES)).toBe(true);
    }
  });

  it('accepts valid panel message types', () => {
    for (const type of VALID_PANEL_TYPES) {
      expect(isValidMessage({ type }, VALID_PANEL_TYPES)).toBe(true);
    }
  });

  it('rejects message with unknown type', () => {
    expect(isValidMessage({ type: 'unknown' }, VALID_BRIDGE_TYPES)).toBe(false);
  });

  it('rejects null', () => {
    expect(isValidMessage(null, VALID_BRIDGE_TYPES)).toBe(false);
  });

  it('rejects undefined', () => {
    expect(isValidMessage(undefined, VALID_BRIDGE_TYPES)).toBe(false);
  });

  it('rejects string', () => {
    expect(isValidMessage('hello', VALID_BRIDGE_TYPES)).toBe(false);
  });

  it('rejects message without type field', () => {
    expect(isValidMessage({ id: 'sdt-1' }, VALID_BRIDGE_TYPES)).toBe(false);
  });

  it('rejects message with numeric type', () => {
    expect(isValidMessage({ type: 42 }, VALID_BRIDGE_TYPES)).toBe(false);
  });

  it('does not accept panel types when checking bridge types', () => {
    expect(isValidMessage({ type: 'inspect:component' }, VALID_BRIDGE_TYPES)).toBe(false);
  });

  it('does not accept bridge types when checking panel types', () => {
    expect(isValidMessage({ type: 'component:mounted' }, VALID_PANEL_TYPES)).toBe(false);
  });
});

describe('isTrustedPanelSender', () => {
  const EXT_ID = 'abcdefghijklmnopabcdefghijklmnop';

  it('accepts a URL under the extension origin', () => {
    expect(isTrustedPanelSender('chrome-extension://' + EXT_ID + '/src/panel/index.html', EXT_ID)).toBe(true);
  });

  it('rejects undefined', () => {
    expect(isTrustedPanelSender(undefined, EXT_ID)).toBe(false);
  });

  it('rejects an empty string', () => {
    expect(isTrustedPanelSender('', EXT_ID)).toBe(false);
  });

  it('rejects an http(s) URL', () => {
    expect(isTrustedPanelSender('https://example.com/src/panel/index.html', EXT_ID)).toBe(false);
  });

  it("rejects another extension's id", () => {
    expect(isTrustedPanelSender('chrome-extension://someotherextensionid000000000000/index.html', EXT_ID)).toBe(false);
  });

  it('rejects a URL where the given id is only a prefix of a longer id (trailing slash matters)', () => {
    // EXT_ID followed by extra characters before the next '/' must NOT match —
    // that's why the check requires a trailing '/' right after the id, not just startsWith(id).
    expect(isTrustedPanelSender('chrome-extension://' + EXT_ID + 'evil/index.html', EXT_ID)).toBe(false);
  });
});

describe('isValidPanelMessage', () => {
  it('rejects non-object messages', () => {
    expect(isValidPanelMessage('hello')).toBe(false);
    expect(isValidPanelMessage(null)).toBe(false);
    expect(isValidPanelMessage(undefined)).toBe(false);
  });

  it('rejects a message with a missing/unknown type', () => {
    expect(isValidPanelMessage({ id: 'sdt-1' })).toBe(false);
    expect(isValidPanelMessage({ type: 'not-a-real-type' })).toBe(false);
  });

  it('rejects a type absent from VALID_PANEL_TYPES even with a plausible payload', () => {
    expect(isValidPanelMessage({ type: 'component:mounted', id: 'sdt-1' })).toBe(false);
  });

  it('validates inspect:component payload shape', () => {
    expect(isValidPanelMessage({ type: 'inspect:component', id: 'sdt-1' })).toBe(true);
    expect(isValidPanelMessage({ type: 'inspect:component', id: 42 })).toBe(false);
  });

  it('validates state:edit payload shape', () => {
    expect(isValidPanelMessage({ type: 'state:edit', signalId: 'sdt-1', path: ['a', 'b'], value: 42 })).toBe(true);
    expect(isValidPanelMessage({ type: 'state:edit', signalId: 42, path: ['a'], value: 42 })).toBe(false);
    expect(isValidPanelMessage({ type: 'state:edit', signalId: 'sdt-1', path: ['a', 2], value: 42 })).toBe(false);
  });

  it('validates state:expand payload shape (non-string path element rejected)', () => {
    expect(isValidPanelMessage({ type: 'state:expand', rootId: 'sdt-1', path: ['a', 'b'] })).toBe(true);
    expect(isValidPanelMessage({ type: 'state:expand', rootId: 'sdt-1', path: ['a', 2] })).toBe(false);
  });

  it('validates graph:request payload shape (componentId optional)', () => {
    expect(isValidPanelMessage({ type: 'graph:request' })).toBe(true);
    expect(isValidPanelMessage({ type: 'graph:request', componentId: 'sdt-1' })).toBe(true);
    expect(isValidPanelMessage({ type: 'graph:request', componentId: 42 })).toBe(false);
  });

  it('validates highlight:component payload shape (id nullable)', () => {
    expect(isValidPanelMessage({ type: 'highlight:component', id: 'sdt-1' })).toBe(true);
    expect(isValidPanelMessage({ type: 'highlight:component', id: null })).toBe(true);
    expect(isValidPanelMessage({ type: 'highlight:component', id: 42 })).toBe(false);
  });

  it('validates open-in-editor payload shape', () => {
    expect(isValidPanelMessage({ type: 'open-in-editor', file: 'a.svelte', line: 1, column: 1 })).toBe(true);
    expect(isValidPanelMessage({ type: 'open-in-editor', file: 'a.svelte', line: '1', column: 1 })).toBe(false);
  });

  it('accepts a payload-less valid type', () => {
    expect(isValidPanelMessage({ type: 'tree:request' })).toBe(true);
    expect(isValidPanelMessage({ type: 'profiler:start' })).toBe(true);
    expect(isValidPanelMessage({ type: 'profiler:stop' })).toBe(true);
  });

  it('is permissive about extra unknown fields on an otherwise-valid message', () => {
    expect(isValidPanelMessage({ type: 'inspect:component', id: 'sdt-1', extraField: 'whatever' })).toBe(true);
  });
});

describe('message type sets', () => {
  it('VALID_BRIDGE_TYPES contains expected types', () => {
    expect(VALID_BRIDGE_TYPES.has('component:mounted')).toBe(true);
    expect(VALID_BRIDGE_TYPES.has('bridge:ready')).toBe(true);
    expect(VALID_BRIDGE_TYPES.has('trace:update')).toBe(true);
  });

  it('VALID_PANEL_TYPES contains expected types', () => {
    expect(VALID_PANEL_TYPES.has('inspect:component')).toBe(true);
    expect(VALID_PANEL_TYPES.has('state:edit')).toBe(true);
    expect(VALID_PANEL_TYPES.has('profiler:start')).toBe(true);
    expect(VALID_PANEL_TYPES.has('tree:request')).toBe(true);
  });
});
