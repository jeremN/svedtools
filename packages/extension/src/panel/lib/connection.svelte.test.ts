import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  connect,
  disconnect,
  send,
  onMessage,
  onDisconnect,
  getConnected,
  getSvelteDetected,
  getSvelteVersion,
  getSvelteUntested,
} from './connection.svelte.js';

/** Minimal chrome.runtime.Port stand-in with real listener add/remove semantics. */
class FakePort {
  postMessage = vi.fn();
  disconnect = vi.fn();
  private messageListeners: Array<(m: unknown) => void> = [];
  private disconnectListeners: Array<() => void> = [];
  onMessage = {
    addListener: (fn: (m: unknown) => void) => this.messageListeners.push(fn),
    removeListener: (fn: (m: unknown) => void) => {
      const i = this.messageListeners.indexOf(fn);
      if (i !== -1) this.messageListeners.splice(i, 1);
    },
  };
  onDisconnect = {
    addListener: (fn: () => void) => this.disconnectListeners.push(fn),
    removeListener: (fn: () => void) => {
      const i = this.disconnectListeners.indexOf(fn);
      if (i !== -1) this.disconnectListeners.splice(i, 1);
    },
  };
  emitMessage(message: unknown) {
    for (const fn of [...this.messageListeners]) fn(message);
  }
  emitDisconnect() {
    for (const fn of [...this.disconnectListeners]) fn();
  }
}

let lastPort: FakePort;
let connectMock: ReturnType<typeof vi.fn>;

function installChrome() {
  connectMock = vi.fn(() => {
    lastPort = new FakePort();
    return lastPort;
  });
  (globalThis as unknown as { chrome: unknown }).chrome = {
    runtime: { connect: connectMock },
    devtools: { inspectedWindow: { tabId: 42 } },
  };
}

describe('connection store', () => {
  beforeEach(() => {
    disconnect(); // tear down any port left over from a previous test
    installChrome();
  });

  it('connect() opens a port and sends panel:init with the inspected tab id', () => {
    connect();
    expect(getConnected()).toBe(true);
    expect(lastPort.postMessage).toHaveBeenCalledWith({ type: 'panel:init', tabId: 42 });
  });

  it('connect() tears down an existing port before opening a new one', () => {
    connect();
    const firstPort = lastPort;
    connect();
    expect(firstPort.disconnect).toHaveBeenCalled();
    expect(connectMock).toHaveBeenCalledTimes(2);
  });

  it('send() forwards a message through the active port', () => {
    connect();
    send({ type: 'inspect:component', id: 'c1' });
    expect(lastPort.postMessage).toHaveBeenCalledWith({ type: 'inspect:component', id: 'c1' });
  });

  it('send() warns and does not throw when there is no active port', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(() => send({ type: 'inspect:component', id: 'c1' })).not.toThrow();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('handleMessage sets Svelte-detected state from bridge:ready', () => {
    connect();
    lastPort.emitMessage({ type: 'bridge:ready', svelteVersion: '5.30.0', protocolVersion: 1, untested: true });
    expect(getSvelteDetected()).toBe(true);
    expect(getSvelteVersion()).toBe('5.30.0');
    expect(getSvelteUntested()).toBe(true);
  });

  it('notifies onMessage subscribers for every incoming message, until unsubscribed', () => {
    connect();
    const received: unknown[] = [];
    const unsubscribe = onMessage((m) => received.push(m));
    lastPort.emitMessage({ type: 'component:unmounted', id: 'c1' });
    expect(received).toEqual([{ type: 'component:unmounted', id: 'c1' }]);

    unsubscribe();
    lastPort.emitMessage({ type: 'component:unmounted', id: 'c2' });
    expect(received).toHaveLength(1);
  });

  it('disconnect() tears down the port and resets connection state', () => {
    connect();
    lastPort.emitMessage({ type: 'bridge:ready', svelteVersion: '5.30.0', protocolVersion: 1 });

    disconnect();

    expect(lastPort.disconnect).toHaveBeenCalled();
    expect(getConnected()).toBe(false);
    expect(getSvelteDetected()).toBe(false);
    expect(getSvelteVersion()).toBeNull();
  });

  it('disconnect() notifies onDisconnect listeners exactly once', () => {
    connect();
    const listener = vi.fn();
    onDisconnect(listener);
    disconnect();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('a port-initiated disconnect (e.g. service worker restart) notifies listeners and auto-reconnects', () => {
    vi.useFakeTimers();
    try {
      connect();
      const listener = vi.fn();
      onDisconnect(listener);

      lastPort.emitDisconnect(); // simulate chrome tearing down the port itself

      expect(listener).toHaveBeenCalledTimes(1);
      expect(getConnected()).toBe(false);

      vi.advanceTimersByTime(1000); // RECONNECT_DELAY_MS
      expect(connectMock).toHaveBeenCalledTimes(2); // initial connect() + auto-reconnect
    } finally {
      vi.useRealTimers();
    }
  });

  it('a stale port-disconnect event arriving after an explicit disconnect() does not double-notify', () => {
    connect();
    const listener = vi.fn();
    onDisconnect(listener);

    disconnect();
    expect(listener).toHaveBeenCalledTimes(1);

    // The store removes its onDisconnect listener as part of disconnect(), so a
    // late/racy event from the same (now-torn-down) port must not fire again.
    lastPort.emitDisconnect();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('schedules a reconnect when chrome.runtime.connect throws (extension context invalidated)', () => {
    vi.useFakeTimers();
    try {
      connectMock.mockImplementationOnce(() => {
        throw new Error('Extension context invalidated.');
      });

      connect();
      expect(getConnected()).toBe(false);

      vi.advanceTimersByTime(1000);
      expect(connectMock).toHaveBeenCalledTimes(2); // the throwing attempt + the retry
    } finally {
      vi.useRealTimers();
    }
  });
});
