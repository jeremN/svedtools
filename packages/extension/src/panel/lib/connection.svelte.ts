import type { BridgeToPanelMessage, PanelToBridgeMessage } from '@svelte-devtools/shared';

const RECONNECT_DELAY_MS = 1000;

// -- Reactive state --

let connected = $state(false);
let svelteDetected = $state(false);
let svelteVersion: string | null = $state(null);
let svelteUntested = $state(false);

let port: chrome.runtime.Port | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
// Guards against double-notifying disconnect listeners when both the explicit
// disconnect() path and the chrome-initiated handleDisconnect() path run for the
// same teardown. Reset to false in connect() once a new session is established.
let disconnectNotified = false;

// -- Message subscribers --
type MessageListener = (message: BridgeToPanelMessage) => void;
type DisconnectListener = () => void;
const listeners: MessageListener[] = [];
const disconnectListeners: DisconnectListener[] = [];

export function onMessage(listener: MessageListener): () => void {
  listeners.push(listener);
  return () => {
    const idx = listeners.indexOf(listener);
    if (idx !== -1) listeners.splice(idx, 1);
  };
}

export function onDisconnect(listener: DisconnectListener): () => void {
  disconnectListeners.push(listener);
  return () => {
    const idx = disconnectListeners.indexOf(listener);
    if (idx !== -1) disconnectListeners.splice(idx, 1);
  };
}

// -- Exported accessors --

export function getConnected(): boolean {
  return connected;
}

export function getSvelteDetected(): boolean {
  return svelteDetected;
}

export function getSvelteVersion(): string | null {
  return svelteVersion;
}

export function getSvelteUntested(): boolean {
  return svelteUntested;
}

// -- Port lifecycle --

export function connect(): void {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  if (port) {
    disconnect();
  }

  try {
    port = chrome.runtime.connect({ name: 'svelte-devtools-panel' });
  } catch {
    // Extension context invalidated — schedule reconnect
    scheduleReconnect();
    return;
  }

  connected = true;
  // New session established — allow the next teardown to notify listeners again.
  disconnectNotified = false;

  port.onMessage.addListener(handleMessage);
  port.onDisconnect.addListener(handleDisconnect);

  port.postMessage({
    type: 'panel:init',
    tabId: chrome.devtools.inspectedWindow.tabId,
  });
}

export function send(message: PanelToBridgeMessage): void {
  if (!port) {
    console.warn('[svelte-devtools] Cannot send message: port is not connected');
    return;
  }
  port.postMessage(message);
}

export function disconnect(): void {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  if (port) {
    port.onMessage.removeListener(handleMessage);
    port.onDisconnect.removeListener(handleDisconnect);
    port.disconnect();
    port = null;
  }

  connected = false;
  svelteDetected = false;
  svelteVersion = null;
  svelteUntested = false;

  // Notify disconnect listeners (e.g., component store reset) so a subsequent
  // connect() does not inherit the previous session's stale state. Guarded so it
  // fires at most once per teardown even if handleDisconnect() already ran.
  notifyDisconnect();
}

// -- Internal handlers --

function handleMessage(message: BridgeToPanelMessage): void {
  if (message.type === 'bridge:ready') {
    svelteDetected = true;
    svelteVersion = message.svelteVersion;
    svelteUntested = message.untested === true;
  }

  // Notify subscribers (copy to handle mid-iteration mutation)
  for (const listener of [...listeners]) {
    listener(message);
  }
}

function handleDisconnect(): void {
  port = null;
  connected = false;
  svelteDetected = false;
  svelteVersion = null;
  svelteUntested = false;

  // Notify disconnect listeners (e.g., component store reset)
  notifyDisconnect();

  // Auto-reconnect after delay (handles service worker restarts)
  scheduleReconnect();
}

// Notifies disconnect listeners exactly once per teardown. Both disconnect() and
// handleDisconnect() route through here; the disconnectNotified flag prevents a
// double-notification if both run for the same session (reset in connect()).
function notifyDisconnect(): void {
  if (disconnectNotified) return;
  disconnectNotified = true;

  // Copy to handle mid-iteration mutation of the subscriber list.
  for (const listener of [...disconnectListeners]) {
    listener();
  }
}

function scheduleReconnect(): void {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, RECONNECT_DELAY_MS);
}
