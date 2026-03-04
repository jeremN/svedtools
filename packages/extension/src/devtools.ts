/**
 * DevTools page: detects Svelte on the inspected page and creates the panel.
 *
 * This script runs in the DevTools context (not the page context).
 * Uses chrome.devtools.inspectedWindow.eval() to check for the bridge.
 *
 * Note: chrome.devtools.inspectedWindow.eval() is the official Chrome API
 * for DevTools extensions to interact with the inspected page — it is NOT
 * the same as JavaScript's eval(). This is the standard pattern used by
 * React DevTools, Vue DevTools, and all other DevTools extensions.
 */

const DETECTION_SCRIPT = `
  !!(window.__svelte_devtools__ || window.__svelte)
`;

let panelCreated = false;

function createPanel() {
  if (panelCreated) return;
  panelCreated = true;

  chrome.devtools.panels.create(
    'Svelte',
    '', // icon path (empty = no icon)
    'src/panel/index.html',
  );
}

function detectSvelte(): Promise<boolean> {
  return new Promise((resolve) => {
    // chrome.devtools.inspectedWindow.eval is the standard Chrome DevTools API
    // for evaluating expressions in the inspected page's context
    chrome.devtools.inspectedWindow.eval(DETECTION_SCRIPT, (result, error) => {
      resolve(!error && result === true);
    });
  });
}

async function tryDetect() {
  // Poll a few times — the bridge might not be injected yet
  for (let attempt = 0; attempt < 10; attempt++) {
    const detected = await detectSvelte();
    if (detected) {
      createPanel();
      return;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
}

// Detect on initial load
tryDetect();

// Re-detect on navigation
chrome.devtools.network.onNavigated.addListener(() => {
  // Panel persists across navigations, but re-check in case
  // the new page also has Svelte
  if (!panelCreated) {
    tryDetect();
  }
});
