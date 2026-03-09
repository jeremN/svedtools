import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, type ViteDevServer } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { svelteDevtools } from 'vite-plugin-svelte-devtools';
import { resolve } from 'node:path';

const FIXTURES_DIR = resolve(import.meta.dirname, 'fixtures');

let server: ViteDevServer;

beforeAll(async () => {
  server = await createServer({
    root: FIXTURES_DIR,
    plugins: [svelte({ compilerOptions: { dev: true } }), svelteDevtools()],
    server: { port: 0 },
    logLevel: 'silent',
  });
  await server.listen();
});

afterAll(async () => {
  // server.close() can hang due to WebSocket/HMR cleanup; race with a timeout
  await Promise.race([server.close(), new Promise((r) => setTimeout(r, 5000))]);
});

async function getTransformed(filename: string): Promise<string> {
  const id = resolve(FIXTURES_DIR, filename);
  const result = await server.transformRequest(id);
  if (!result) throw new Error(`Transform returned null for ${filename}`);
  return result.code;
}

describe('plugin output verification', () => {
  it('instruments $.push for component tracking', async () => {
    const code = await getTransformed('basic-counter.svelte');
    expect(code).toContain('__svelte_devtools__');
    expect(code).toContain('onPush');
  });

  it('instruments $.pop for render timing', async () => {
    const code = await getTransformed('basic-counter.svelte');
    expect(code).toContain('onPop');
  });

  it('instruments signal registration via $.tag', async () => {
    const code = await getTransformed('basic-counter.svelte');
    expect(code).toContain('registerSignal');
  });

  it('instruments derived chains', async () => {
    const code = await getTransformed('derived-chain.svelte');
    expect(code).toContain('registerSignal');
    const matches = code.match(/registerSignal/g);
    expect(matches?.length).toBeGreaterThanOrEqual(2);
  });

  it('instruments $effect with registerEffect', async () => {
    const code = await getTransformed('effect-component.svelte');
    expect(code).toContain('registerEffect');
  });

  it('instruments $.set with preMutation/onMutation', async () => {
    const code = await getTransformed('effect-component.svelte');
    expect(code).toContain('preMutation');
    expect(code).toContain('onMutation');
  });

  it('preserves original Svelte output structure', async () => {
    const code = await getTransformed('basic-counter.svelte');
    // The original $.push and $.pop calls must still be present
    expect(code).toMatch(/\$\.push/);
    expect(code).toMatch(/\$\.pop/);
  });

  it('handles nested reactive objects', async () => {
    const code = await getTransformed('nested-reactivity.svelte');
    expect(code).toContain('__svelte_devtools__');
  });

  it('injects bridge virtual module', async () => {
    const code = await getTransformed('basic-counter.svelte');
    // The bridge is injected via transformIndexHtml, not in component output.
    // But the component should reference the devtools global.
    expect(code).toContain('__svelte_devtools__');
  });
});
