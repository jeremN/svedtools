/**
 * Content script: relays messages between page and extension.
 *
 * Runs in the isolated world — can't access window.__svelte_devtools__
 * directly, but CAN listen for postMessage from the page context.
 *
 * Flow:
 *   Page (bridge postMessage) → Content Script → chrome.runtime port → Service Worker → Panel
 *   Panel → Service Worker → chrome.runtime port → Content Script → Page (postMessage)
 */

const SOURCE = 'svelte-devtools-pro';
let port: chrome.runtime.Port | null = null;

function getPort(): chrome.runtime.Port {
  if (port) return port;

  port = chrome.runtime.connect({ name: 'svelte-devtools-content' });

  port.onMessage.addListener((message) => {
    // Relay extension → page (use '/' to target same origin only)
    window.postMessage({ source: SOURCE, payload: message }, '/');
  });

  port.onDisconnect.addListener(() => {
    port = null;
  });

  return port;
}

// Listen for messages FROM the page (bridge)
window.addEventListener('message', (event) => {
  // Only accept messages from this window
  if (event.source !== window) return;

  const data = event.data;
  if (!data || data.source !== SOURCE) return;

  const payload = data.payload;
  if (!payload || typeof payload.type !== 'string') return;

  // Relay page → extension
  try {
    getPort().postMessage(payload);
  } catch {
    // Port disconnected, reset and retry once
    port = null;
    try {
      getPort().postMessage(payload);
    } catch {
      // Extension context invalidated (e.g. extension updated)
    }
  }
});
