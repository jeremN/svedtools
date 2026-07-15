/**
 * Service worker: routes messages between content scripts and DevTools panels.
 *
 * Manages two types of port connections:
 * - Content script ports (name: 'svelte-devtools-content') — identified by sender.tab.id
 * - Panel ports (name: 'svelte-devtools-panel') — self-identify their tab via init message
 *
 * Also manages the extension badge to indicate Svelte detection.
 */

import { isValidMessage, VALID_BRIDGE_TYPES, VALID_PANEL_TYPES } from './service-worker-utils.js';

// Port maps: tabId → port
const contentPorts = new Map<number, chrome.runtime.Port>();
const panelPorts = new Map<number, chrome.runtime.Port>();

// Track which tabs have Svelte detected (with full bridge:ready data)
const svelteTabs = new Map<number, { svelteVersion: string; protocolVersion: number; untested: boolean }>();

function setBadge(tabId: number, detected: boolean) {
  if (detected) {
    chrome.action.setBadgeText({ text: '✓', tabId });
    chrome.action.setBadgeBackgroundColor({ color: '#ff3e00', tabId });
  } else {
    chrome.action.setBadgeText({ text: '', tabId });
  }
}

chrome.runtime.onConnect.addListener((port) => {
  if (port.name === 'svelte-devtools-content') {
    // Content script connection — tab ID comes from sender
    const tabId = port.sender?.tab?.id;
    if (tabId == null) return;

    contentPorts.set(tabId, port);

    // A new document just started for this tab — reset its state; a fresh
    // bridge:ready will re-set it if the new page is a Svelte page.
    svelteTabs.delete(tabId);
    setBadge(tabId, false);

    // Panel opened before this page finished loading (or the page reloaded
    // while the panel stayed open) — tell the new content port right away so
    // the bridge doesn't sit gated until the next panel lifecycle event.
    if (panelPorts.has(tabId)) {
      try {
        port.postMessage({ type: 'devtools:panel-connected' });
      } catch {
        contentPorts.delete(tabId);
      }
    }

    port.onMessage.addListener((message) => {
      // Validate message type against bridge protocol
      if (!isValidMessage(message, VALID_BRIDGE_TYPES)) return;

      // If bridge:ready, cache full data for late-connecting panels
      if (message.type === 'bridge:ready') {
        svelteTabs.set(tabId, {
          svelteVersion: message.svelteVersion || 'unknown',
          protocolVersion: message.protocolVersion || 1,
          untested: message.untested === true,
        });
        setBadge(tabId, true);
      }

      // Forward to panel if connected
      const panelPort = panelPorts.get(tabId);
      if (panelPort) {
        try {
          panelPort.postMessage(message);
        } catch {
          panelPorts.delete(tabId);
        }
      }
    });

    port.onDisconnect.addListener(() => {
      // Only clean up if the map still points at THIS port — a delayed
      // disconnect from an old document must not clobber the state of a new
      // document that already registered its own port for this tab.
      if (contentPorts.get(tabId) === port) {
        contentPorts.delete(tabId);
        svelteTabs.delete(tabId);
        setBadge(tabId, false);
      }
    });
  }

  if (port.name === 'svelte-devtools-panel') {
    // Panel connection — tab ID comes via init message
    let panelTabId: number | null = null;

    port.onMessage.addListener((message) => {
      // First message from panel identifies the tab
      if (message.type === 'panel:init') {
        if (typeof message.tabId !== 'number' || !Number.isFinite(message.tabId)) return;
        const initTabId: number = message.tabId;
        panelTabId = initTabId;
        panelPorts.set(initTabId, port);

        // Tell the page a panel is now connected so the bridge un-gates its
        // per-write hot path (stack capture, serialization, trace messages).
        try {
          contentPorts.get(initTabId)?.postMessage({ type: 'devtools:panel-connected' });
        } catch {
          contentPorts.delete(initTabId);
        }

        // Replay cached bridge:ready with full version data
        const svelteInfo = svelteTabs.get(initTabId);
        if (svelteInfo) {
          port.postMessage({
            type: 'bridge:ready',
            ...svelteInfo,
          });
        }
        return;
      }

      // Validate panel messages against protocol
      if (!isValidMessage(message, VALID_PANEL_TYPES)) return;

      // Forward panel messages to content script
      if (panelTabId == null) return;
      const contentPort = contentPorts.get(panelTabId);
      if (contentPort) {
        try {
          contentPort.postMessage(message);
        } catch {
          contentPorts.delete(panelTabId);
        }
      }
    });

    port.onDisconnect.addListener(() => {
      // Identity guard: a delayed disconnect from an old panel must not
      // unregister (and notify against) a newer panel for the same tab.
      if (panelTabId != null && panelPorts.get(panelTabId) === port) {
        panelPorts.delete(panelTabId);
        try {
          contentPorts.get(panelTabId)?.postMessage({ type: 'devtools:panel-disconnected' });
        } catch {
          contentPorts.delete(panelTabId);
        }
      }
    });
  }
});

// Clean up when tabs are removed
chrome.tabs.onRemoved.addListener((tabId) => {
  contentPorts.delete(tabId);
  panelPorts.delete(tabId);
  svelteTabs.delete(tabId);
});

// Cleanup of last resort: only when the tab has NO live content port. A live
// port means either a same-document navigation (must NOT wipe — SvelteKit's
// router fires status:"loading" ~50ms after hydration and bridge:ready is
// once-per-load) or a real navigation whose port-disconnect handler will do
// the cleanup. No port means the SW restarted (in-memory state gone, badge
// orphaned) or the page can't run content scripts (chrome:// etc.) — here
// this listener is the only hook that can clear a stale badge.
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'loading' && !contentPorts.has(tabId)) {
    svelteTabs.delete(tabId);
    setBadge(tabId, false);
  }
});
