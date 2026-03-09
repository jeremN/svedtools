import { describe, it, expect } from 'vitest';
import { isValidMessage, VALID_BRIDGE_TYPES, VALID_PANEL_TYPES } from './service-worker-utils.js';

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
  });
});
