import { test, expect } from '@playwright/test';

test.describe('Reactivity Graph', () => {
  test('buildGraph() returns nodes and edges for effect chain page', async ({
    page,
  }) => {
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
  });

  test('graph:snapshot message is emitted when graph:request is sent', async ({
    page,
  }) => {
    await page.goto('/demos/effect-chain');
    await page.waitForTimeout(500);

    const snapshot = await page.evaluate(() => {
      return new Promise<any>((resolve) => {
        const timeout = setTimeout(
          () => resolve({ error: 'timeout' }),
          5000
        );

        window.addEventListener('message', function handler(event) {
          const data = event.data;
          if (
            data &&
            data.source === 'svelte-devtools-pro' &&
            data.payload?.type === 'graph:snapshot'
          ) {
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
          window.location.origin
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
