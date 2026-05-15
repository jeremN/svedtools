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
      contentPorts.delete(tabId);
      svelteTabs.delete(tabId);
      setBadge(tabId, false);
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
      if (panelTabId != null) {
        panelPorts.delete(panelTabId);
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

// Reset badge on navigation (page might not have Svelte anymore)
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'loading') {
    svelteTabs.delete(tabId);
    setBadge(tabId, false);
  }
});
