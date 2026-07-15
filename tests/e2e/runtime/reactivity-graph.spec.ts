import { test, expect, type Page } from '@playwright/test';

/**
 * The bridge gates its per-write hot path (and, per plan 008, graph-dirty
 * marking) behind a simulated 'devtools:panel-connected' signal — see plan
 * 004. Runtime pages have no real extension attached, so specs that need
 * live graph updates must post this message themselves before subscribing.
 */
async function simulatePanelConnected(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.postMessage(
      { source: 'svelte-devtools-pro', payload: { type: 'devtools:panel-connected' } },
      window.location.origin,
    );
  });
}

/** Starts capturing bridge→panel graph:snapshot messages into window.__graphSnapshots. */
async function captureGraphSnapshots(page: Page): Promise<void> {
  await page.evaluate(() => {
    (window as unknown as { __graphSnapshots: unknown[] }).__graphSnapshots = [];
    window.addEventListener('message', (event) => {
      const data = event.data;
      if (data && data.source === 'svelte-devtools-pro' && data.payload?.type === 'graph:snapshot') {
        (window as unknown as { __graphSnapshots: unknown[] }).__graphSnapshots.push(data.payload);
      }
    });
  });
}

async function snapshotCount(page: Page): Promise<number> {
  return page.evaluate(() => (window as unknown as { __graphSnapshots: unknown[] }).__graphSnapshots.length);
}

async function getSnapshots(page: Page): Promise<any[]> {
  return page.evaluate(() => (window as unknown as { __graphSnapshots: unknown[] }).__graphSnapshots);
}

test.describe('Reactivity Graph', () => {
  test('buildGraph() returns nodes and edges for effect chain page', async ({ page }) => {
    await page.goto('/demos/effect-chain');
    await page.waitForTimeout(500);

    const graph = await page.evaluate(() => {
      return window.__svelte_devtools__!.buildGraph(null);
    });

    expect(graph).toHaveProperty('nodes');
    expect(graph).toHaveProperty('edges');
    expect(Array.isArray(graph.nodes)).toBe(true);
    expect(Array.isArray(graph.edges)).toBe(true);
    expect(graph.nodes.length).toBeGreaterThan(0);

    // Each node should have id, type, label
    const node = graph.nodes[0];
    expect(node).toHaveProperty('id');
    expect(node).toHaveProperty('type');

    // The effect chain page has state -> derived -> effect,
    // so there should be edges connecting them
    expect(graph.edges.length).toBeGreaterThan(0);

    const edge = graph.edges[0];
    expect(edge).toHaveProperty('from');
    expect(edge).toHaveProperty('to');

    // F19 guard: the permanent profiling wrapper must not leak into labels
    const labels = graph.nodes.map((n: any) => n.label);
    expect(labels).not.toContain('wrappedEffect');
  });

  test('graph:snapshot message is emitted when graph:request is sent', async ({ page }) => {
    await page.goto('/demos/effect-chain');
    await page.waitForTimeout(500);

    const snapshot = await page.evaluate(() => {
      return new Promise<any>((resolve) => {
        const timeout = setTimeout(() => resolve({ error: 'timeout' }), 5000);

        window.addEventListener('message', function handler(event) {
          const data = event.data;
          if (data && data.source === 'svelte-devtools-pro' && data.payload?.type === 'graph:snapshot') {
            clearTimeout(timeout);
            window.removeEventListener('message', handler);
            resolve(data.payload);
          }
        });

        window.postMessage(
          {
            source: 'svelte-devtools-pro',
            payload: { type: 'graph:request', componentId: null },
          },
          window.location.origin,
        );
      });
    });

    expect(snapshot).not.toHaveProperty('error');
    expect(snapshot).toHaveProperty('type', 'graph:snapshot');
    expect(snapshot).toHaveProperty('nodes');
    expect(snapshot).toHaveProperty('edges');
    expect(Array.isArray(snapshot.nodes)).toBe(true);
    expect(Array.isArray(snapshot.edges)).toBe(true);
    expect(snapshot.nodes.length).toBeGreaterThan(0);
  });
});

test.describe('Reactivity Graph — live updates (plan 008)', () => {
  test('graph:subscribe sends an immediate snapshot, then re-emits live on state mutation', async ({ page }) => {
    await page.goto('/demos/effect-chain');
    await page.waitForTimeout(500);
    await simulatePanelConnected(page);
    await captureGraphSnapshots(page);

    await page.evaluate(() => {
      window.postMessage(
        { source: 'svelte-devtools-pro', payload: { type: 'graph:subscribe' } },
        window.location.origin,
      );
    });

    // Subscribing baselines an immediate snapshot without waiting for the throttle.
    await expect.poll(() => snapshotCount(page)).toBeGreaterThanOrEqual(1);

    const [before] = await getSnapshots(page);
    const sourceNodeBefore = before.nodes.find((n: any) => n.type === 'source' && n.value === 1);
    expect(sourceNodeBefore).toBeTruthy();

    // Trigger a state mutation on the page — reuses the effect-chain demo's
    // own control, as the sibling specs in this directory do.
    await page.locator('[data-testid="effect-increment"]').click();

    // A second graph:snapshot should arrive on its own, without any further
    // graph:request/subscribe — the throttle is 500ms, so 3s is generous slack.
    await expect.poll(() => snapshotCount(page), { timeout: 3000 }).toBeGreaterThanOrEqual(2);

    const snapshots = await getSnapshots(page);
    const after = snapshots[snapshots.length - 1];
    const sourceNodeAfter = after.nodes.find((n: any) => n.id === sourceNodeBefore.id);
    expect(sourceNodeAfter).toBeTruthy();
    expect(sourceNodeAfter.value).toBe(2);
  });

  test('graph:unsubscribe stops the live snapshot stream', async ({ page }) => {
    await page.goto('/demos/effect-chain');
    await page.waitForTimeout(500);
    await simulatePanelConnected(page);
    await captureGraphSnapshots(page);

    await page.evaluate(() => {
      window.postMessage(
        { source: 'svelte-devtools-pro', payload: { type: 'graph:subscribe' } },
        window.location.origin,
      );
    });

    await expect.poll(() => snapshotCount(page)).toBeGreaterThanOrEqual(1);

    await page.evaluate(() => {
      window.postMessage(
        { source: 'svelte-devtools-pro', payload: { type: 'graph:unsubscribe' } },
        window.location.origin,
      );
      // Clear the captured-message buffer so only post-unsubscribe traffic counts.
      (window as unknown as { __graphSnapshots: unknown[] }).__graphSnapshots.length = 0;
    });

    await page.locator('[data-testid="effect-increment"]').click();

    // Negative assertion: a bounded fixed wait is acceptable here (no event to
    // poll for — we're confirming absence). trace:update and other message
    // types may still flow; the capture listener only records graph:snapshot,
    // so they don't affect this count.
    await page.waitForTimeout(1500);

    expect(await snapshotCount(page)).toBe(0);
  });

  test('re-subscribing after the SW-restart ordering resumes the live stream', async ({ page }) => {
    // MV3 SW-death resync (plan 010): when the service worker dies, the
    // content port's lazy reconnect can reach the bridge with an authoritative
    // devtools:panel-disconnected (dropping the graph subscription) BEFORE the
    // panel's own ~1s reconnect re-sends devtools:panel-connected — after
    // which the panel's connection-reactive effect re-sends graph:subscribe.
    // Killing a real MV3 service worker isn't feasible from Playwright, so
    // this pins the wire-level message contract of that ordering instead.
    await page.goto('/demos/effect-chain');
    await page.waitForTimeout(500);
    await simulatePanelConnected(page);
    await captureGraphSnapshots(page);

    await page.evaluate(() => {
      window.postMessage(
        { source: 'svelte-devtools-pro', payload: { type: 'graph:subscribe' } },
        window.location.origin,
      );
    });
    await expect.poll(() => snapshotCount(page)).toBeGreaterThanOrEqual(1);

    // The restart ordering: authoritative disconnect (drops the subscription),
    // the panel's reconnect, then the panel effect's re-subscribe.
    await page.evaluate(() => {
      window.postMessage(
        { source: 'svelte-devtools-pro', payload: { type: 'devtools:panel-disconnected' } },
        window.location.origin,
      );
      window.postMessage(
        { source: 'svelte-devtools-pro', payload: { type: 'devtools:panel-connected' } },
        window.location.origin,
      );
      window.postMessage(
        { source: 'svelte-devtools-pro', payload: { type: 'graph:subscribe' } },
        window.location.origin,
      );
      // Clear the buffer so only post-resync traffic counts (messages posted
      // above are handled after this evaluate returns, as in the spec above).
      (window as unknown as { __graphSnapshots: unknown[] }).__graphSnapshots.length = 0;
    });

    // The re-subscribe baselines an immediate snapshot...
    await expect.poll(() => snapshotCount(page)).toBeGreaterThanOrEqual(1);

    // ...and the stream is genuinely live again: a state mutation re-emits on
    // its own, with no further graph:request/subscribe.
    await page.evaluate(() => {
      (window as unknown as { __graphSnapshots: unknown[] }).__graphSnapshots.length = 0;
    });
    await page.locator('[data-testid="effect-increment"]').click();
    await expect.poll(() => snapshotCount(page), { timeout: 3000 }).toBeGreaterThanOrEqual(1);
  });
});
