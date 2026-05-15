import type { BridgeToPanelMessage, PanelToBridgeMessage } from '@svelte-devtools/shared';

const MAX_MESSAGES = 100;
const RECONNECT_DELAY_MS = 1000;

// -- Reactive state --

let connected = $state(false);
let svelteDetected = $state(false);
let svelteVersion: string | null = $state(null);
let svelteUntested = $state(false);
let messages: BridgeToPanelMessage[] = $state([]);

let port: chrome.runtime.Port | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

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

export function getMessages(): BridgeToPanelMessage[] {
  return messages;
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
  messages = [];
}

// -- Internal handlers --

function handleMessage(message: BridgeToPanelMessage): void {
  if (message.type === 'bridge:ready') {
    svelteDetected = true;
    svelteVersion = message.svelteVersion;
    svelteUntested = message.untested === true;
  }

  messages.push(message);
  if (messages.length > MAX_MESSAGES) {
    messages.splice(0, messages.length - MAX_MESSAGES);
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
  for (const listener of [...disconnectListeners]) {
    listener();
  }

  // Auto-reconnect after delay (handles service worker restarts)
  scheduleReconnect();
}

function scheduleReconnect(): void {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, RECONNECT_DELAY_MS);
}
