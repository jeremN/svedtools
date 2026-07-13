import { test, expect } from '@playwright/test';

/**
 * Regression test for plan 002 (component-unmount tracking). Before this
 * plan, nothing ever called `removeComponent`: the tree accumulated every
 * component instance that ever mounted ({#if} toggles/{#each} removals
 * showed stale duplicates forever) and signalMap/idToSignal/effectMap grew
 * monotonically for the whole dev session. The playground's `#toggle-counter`
 * button ({#if showToggleCounter}<Counter />{/if} in App.svelte) mounts a
 * second, independent Counter instance so this spec can exercise unmount
 * without disturbing the always-mounted Counter the smoke spec also asserts
 * on.
 */
test.describe('Component unmount tracking', () => {
  test('unmount removes the node + its signals; remount creates a fresh node (no duplicate accumulation)', async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    const svelteErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error' && /effect_update_depth|update_depth_exceeded|svelte/i.test(msg.text())) {
        svelteErrors.push(msg.text());
      }
    });

    await page.goto('/');
    // Let effects settle — an effect cycle would keep re-running/throwing here.
    await page.waitForTimeout(800);

    const baseline = await page.evaluate(() => {
      const tree = window.__svelte_devtools__!.getTree();
      return {
        treeLength: tree.length,
        counterIds: tree.filter((n: any) => n.name === 'Counter').map((n: any) => n.id),
        signalMapSize: window.__svelte_devtools__!.signalMap.size,
      };
    });
    // App.svelte always renders one Counter, plus the toggleable one behind
    // #toggle-counter — two Counter instances before any interaction.
    expect(baseline.counterIds.length, 'expected two Counter instances before toggling').toBe(2);

    await page.click('#toggle-counter');

    // Poll getTree() until exactly one of the two original Counter ids
    // remains (the always-mounted Counter). Teardown fires via an injected
    // $effect cleanup registered at mount time, so it need not be
    // synchronous with the click.
    await expect
      .poll(async () => {
        return page.evaluate((ids: string[]) => {
          const tree = window.__svelte_devtools__!.getTree();
          return tree.filter((n: any) => ids.includes(n.id)).length;
        }, baseline.counterIds);
      }, 'toggled-off Counter should disappear from getTree()')
      .toBe(1);

    const afterUnmount = await page.evaluate(() => ({
      treeLength: window.__svelte_devtools__!.getTree().length,
      signalMapSize: window.__svelte_devtools__!.signalMap.size,
    }));
    expect(afterUnmount.treeLength, 'tree should shrink by exactly one node after unmount').toBe(
      baseline.treeLength - 1,
    );
    expect(
      afterUnmount.signalMapSize,
      'signalMap should drop the unmounted Counter’s signals (count/doubled/quadrupled)',
    ).toBeLessThan(baseline.signalMapSize);

    // Remount.
    await page.click('#toggle-counter');
    await expect
      .poll(async () => {
        return page.evaluate(
          () => window.__svelte_devtools__!.getTree().filter((n: any) => n.name === 'Counter').length,
        );
      }, 'remounted Counter should reappear in getTree()')
      .toBe(2);

    const afterRemount = await page.evaluate(() => {
      const tree = window.__svelte_devtools__!.getTree();
      return {
        treeLength: tree.length,
        counterIds: tree.filter((n: any) => n.name === 'Counter').map((n: any) => n.id),
      };
    });
    // Total node count returns to baseline — NOT baseline + 1, which would
    // mean the previously-unmounted node was never removed (the
    // duplicate-accumulation regression this plan kills).
    expect(afterRemount.treeLength, 'tree should return to baseline count on remount').toBe(baseline.treeLength);
    // The remounted Counter gets a brand-new id rather than reusing the one
    // that was just torn down.
    const newCounterId = afterRemount.counterIds.find((id: string) => !baseline.counterIds.includes(id));
    expect(newCounterId, 'remounted Counter should have a new id, not a reused one').toBeTruthy();

    expect(pageErrors, `uncaught errors on playground:\n${pageErrors.join('\n')}`).toEqual([]);
    expect(svelteErrors, `Svelte runtime errors on playground:\n${svelteErrors.join('\n')}`).toEqual([]);
  });
});
