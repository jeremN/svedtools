import { test, expect } from '@playwright/test';

// Round-trip helper: post a panel→bridge message and resolve with the next
// bridge→panel message of the given type (same pattern as
// state-inspection.spec.ts).
async function sendAndAwait(page: import('@playwright/test').Page, payload: unknown, replyType: string) {
  return page.evaluate(
    ({ payload, replyType }) => {
      return new Promise<any>((resolve) => {
        const timeout = setTimeout(() => resolve({ error: 'timeout' }), 5000);
        window.addEventListener('message', function handler(event) {
          const data = event.data;
          if (data && data.source === 'svelte-devtools-pro' && data.payload?.type === replyType) {
            clearTimeout(timeout);
            window.removeEventListener('message', handler);
            resolve(data.payload);
          }
        });
        window.postMessage({ source: 'svelte-devtools-pro', payload }, window.location.origin);
      });
    },
    { payload, replyType },
  );
}

async function inspectByName(page: import('@playwright/test').Page, componentName: string) {
  const tree = await page.evaluate(() => window.__svelte_devtools__!.getTree());
  const node = tree.find((n: any) => n.name === componentName);
  expect(node, `component ${componentName} not found in tree`).toBeDefined();
  const snapshot = await sendAndAwait(page, { type: 'inspect:component', id: node!.id }, 'state:snapshot');
  expect(snapshot).not.toHaveProperty('error');
  return snapshot;
}

function signalByLabel(snapshot: any, label: string) {
  const sig = snapshot.signals.find((s: any) => s.label === label);
  expect(sig, `signal '${label}' not in snapshot`).toBeDefined();
  return sig;
}

test.describe('State editing', () => {
  test('edits a top-level primitive $state and reactivity propagates', async ({ page }) => {
    await page.goto('/demos/counter');
    await page.waitForFunction(() => (window.__svelte_devtools__?.getTree().length ?? 0) > 0);

    const snapshot = await inspectByName(page, 'Counter');
    const count = signalByLabel(snapshot, 'count');

    const after = await sendAndAwait(
      page,
      { type: 'state:edit', signalId: count.id, path: [], value: 42 },
      'state:snapshot',
    );
    expect(after).not.toHaveProperty('error');
    expect(signalByLabel(after, 'count').value).toBe(42);

    // Real reactivity: the DOM and the derived both updated.
    await expect(page.locator('[data-testid="counter-value"]')).toHaveText('42');
    await expect(page.locator('[data-testid="counter-doubled"]')).toContainText('84');
  });

  test('edits nested properties through the $state proxy', async ({ page }) => {
    await page.goto('/demos/nested-state');
    await page.waitForFunction(() => (window.__svelte_devtools__?.getTree().length ?? 0) > 0);

    const snapshot = await inspectByName(page, 'NestedState');
    const user = signalByLabel(snapshot, 'user');

    await sendAndAwait(page, { type: 'state:edit', signalId: user.id, path: ['name'], value: 'Bob' }, 'state:snapshot');
    await expect(page.locator('[data-testid="nested-display"]')).toContainText('Bob lives in Paris');

    await sendAndAwait(
      page,
      { type: 'state:edit', signalId: user.id, path: ['address', 'city'], value: 'Lyon' },
      'state:snapshot',
    );
    await expect(page.locator('[data-testid="nested-display"]')).toContainText('Bob lives in Lyon, France');
  });

  test('refuses to edit a derived — and reports it as derived', async ({ page }) => {
    await page.goto('/demos/counter');
    await page.waitForFunction(() => (window.__svelte_devtools__?.getTree().length ?? 0) > 0);

    const snapshot = await inspectByName(page, 'Counter');
    const doubled = signalByLabel(snapshot, 'doubled');
    // Honest typing (plan 018): tagged deriveds now classify at read time.
    expect(doubled.type).toBe('derived');

    const after = await sendAndAwait(
      page,
      { type: 'state:edit', signalId: doubled.id, path: [], value: 99 },
      'state:snapshot',
    );
    expect(after).not.toHaveProperty('error');
    expect(signalByLabel(after, 'doubled').value).toBe(0);
    await expect(page.locator('[data-testid="counter-doubled"]')).toContainText('Doubled: 0');

    // Nested paths on a derived are refused by the same guard (the guard
    // fires before the path walk — see the state:edit case in bridge/main.ts).
    const afterNested = await sendAndAwait(
      page,
      { type: 'state:edit', signalId: doubled.id, path: ['anything'], value: 99 },
      'state:snapshot',
    );
    expect(signalByLabel(afterNested, 'doubled').value).toBe(0);
  });

  test('malformed edits are refused and leave the page functional', async ({ page }) => {
    const pageErrors: Error[] = [];
    page.on('pageerror', (e) => pageErrors.push(e));

    await page.goto('/demos/counter');
    await page.waitForFunction(() => (window.__svelte_devtools__?.getTree().length ?? 0) > 0);

    const snapshot = await inspectByName(page, 'Counter');
    const count = signalByLabel(snapshot, 'count');

    // Unknown signal id: fire-and-forget (no reply is expected for unknown ids).
    await page.evaluate(() => {
      window.postMessage(
        {
          source: 'svelte-devtools-pro',
          payload: { type: 'state:edit', signalId: 'sdt-999999', path: [], value: 1 },
        },
        window.location.origin,
      );
    });

    // Known signal, nonexistent path: replies with an unchanged snapshot.
    const after = await sendAndAwait(
      page,
      { type: 'state:edit', signalId: count.id, path: ['nope', 'deeper'], value: 1 },
      'state:snapshot',
    );
    expect(signalByLabel(after, 'count').value).toBe(0);

    // The app is still fully alive.
    await page.locator('[data-testid="counter-increment"]').click();
    await expect(page.locator('[data-testid="counter-value"]')).toHaveText('1');
    expect(pageErrors).toEqual([]);
  });
});
