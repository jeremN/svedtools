import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const { sendMock } = vi.hoisted(() => ({ sendMock: vi.fn() }));
vi.mock('./connection.svelte.js', () => ({ send: sendMock }));

import {
  toggle,
  isOpen,
  entry,
  processExpansionMessage,
  refreshAllOpen,
  scheduleLiveRefresh,
  resetExpansion,
} from './expansion.svelte.js';

describe('expansion store', () => {
  beforeEach(() => {
    sendMock.mockClear();
    resetExpansion();
  });

  describe('toggle', () => {
    it('opens a path, caches a loading entry, and sends state:expand', () => {
      toggle('r1', ['a']);
      expect(isOpen('r1', ['a'])).toBe(true);
      expect(entry('r1', ['a'])).toEqual({ status: 'loading' });
      expect(sendMock).toHaveBeenCalledWith({ type: 'state:expand', rootId: 'r1', path: ['a'] });
    });

    it('closes an already-open path without re-sending state:expand', () => {
      toggle('r1', ['a']);
      sendMock.mockClear();
      toggle('r1', ['a']);
      expect(isOpen('r1', ['a'])).toBe(false);
      expect(entry('r1', ['a'])).toBeUndefined();
      expect(sendMock).not.toHaveBeenCalled();
    });
  });

  describe('processExpansionMessage (state:expanded)', () => {
    it('fills the cache with ready status + children for an open path', () => {
      toggle('r1', ['a']);
      processExpansionMessage({ type: 'state:expanded', rootId: 'r1', path: ['a'], children: { x: 1 } });
      expect(entry('r1', ['a'])).toEqual({ status: 'ready', children: { x: 1 } });
    });

    it('sets error status when children is null', () => {
      toggle('r1', ['a']);
      processExpansionMessage({ type: 'state:expanded', rootId: 'r1', path: ['a'], children: null });
      expect(entry('r1', ['a'])).toEqual({ status: 'error' });
    });

    it('ignores a reply for a path collapsed before the reply arrived', () => {
      toggle('r1', ['a']);
      toggle('r1', ['a']); // collapse before the reply arrives
      processExpansionMessage({ type: 'state:expanded', rootId: 'r1', path: ['a'], children: { x: 1 } });
      expect(isOpen('r1', ['a'])).toBe(false);
      expect(entry('r1', ['a'])).toBeUndefined();
    });

    it('ignores messages of other types', () => {
      toggle('r1', ['a']);
      processExpansionMessage({ type: 'bridge:ready', svelteVersion: '5.0.0', protocolVersion: 1 });
      expect(entry('r1', ['a'])).toEqual({ status: 'loading' });
    });
  });

  describe('key separator', () => {
    it('does not collide keys for a dotted segment vs. a split path', () => {
      toggle('r1', ['a.b']);
      toggle('r1', ['a', 'b']);
      expect(isOpen('r1', ['a.b'])).toBe(true);
      expect(isOpen('r1', ['a', 'b'])).toBe(true);

      processExpansionMessage({ type: 'state:expanded', rootId: 'r1', path: ['a.b'], children: { x: 1 } });
      expect(entry('r1', ['a.b'])).toEqual({ status: 'ready', children: { x: 1 } });
      // The split-path entry must remain untouched by the dotted-path reply.
      expect(entry('r1', ['a', 'b'])).toEqual({ status: 'loading' });
    });

    it('does not collide keys for a spaced segment vs. a split path', () => {
      toggle('r1', ['a b']);
      toggle('r1', ['a', 'b']);
      expect(isOpen('r1', ['a b'])).toBe(true);
      expect(isOpen('r1', ['a', 'b'])).toBe(true);

      processExpansionMessage({ type: 'state:expanded', rootId: 'r1', path: ['a b'], children: { y: 2 } });
      expect(entry('r1', ['a b'])).toEqual({ status: 'ready', children: { y: 2 } });
      expect(entry('r1', ['a', 'b'])).toEqual({ status: 'loading' });
    });
  });

  describe('refreshAllOpen', () => {
    it('re-sends state:expand for every currently open key', () => {
      toggle('r1', ['a']);
      toggle('r2', ['b', 'c']);
      sendMock.mockClear();

      refreshAllOpen();

      expect(sendMock).toHaveBeenCalledWith({ type: 'state:expand', rootId: 'r1', path: ['a'] });
      expect(sendMock).toHaveBeenCalledWith({ type: 'state:expand', rootId: 'r2', path: ['b', 'c'] });
    });
  });

  describe('scheduleLiveRefresh', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('debounces, then sends inspect:component + refreshes open paths', () => {
      toggle('r1', ['a']);
      sendMock.mockClear();

      scheduleLiveRefresh('c1');
      scheduleLiveRefresh('c1'); // called again inside the debounce window: must not schedule a second timer
      expect(sendMock).not.toHaveBeenCalled();

      vi.advanceTimersByTime(50);

      expect(sendMock).toHaveBeenCalledWith({ type: 'inspect:component', id: 'c1' });
      expect(sendMock).toHaveBeenCalledWith({ type: 'state:expand', rootId: 'r1', path: ['a'] });
    });

    it('does not send inspect:component when no component is selected', () => {
      scheduleLiveRefresh(null);
      vi.advanceTimersByTime(50);
      expect(sendMock).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'inspect:component' }));
    });
  });

  describe('resetExpansion', () => {
    it('clears the cache and closes all open paths', () => {
      toggle('r1', ['a']);
      resetExpansion();
      expect(isOpen('r1', ['a'])).toBe(false);
      expect(entry('r1', ['a'])).toBeUndefined();
    });
  });
});
