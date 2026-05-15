import { defineConfig } from 'tsup';

/**
 * Two parallel builds:
 *   1. dist/index.js          — the plugin itself (ESM, externalized peers)
 *   2. dist/bridge.js         — the page-context runtime bridge, fully bundled
 *                               (no imports left, so it can be served as a
 *                               self-contained <script type="module">)
 */
export default defineConfig([
  {
    entry: ['src/index.ts'],
    format: ['esm'],
    dts: true,
    clean: true,
    sourcemap: true,
    external: ['vite', 'svelte', 'acorn', 'estree-walker', 'magic-string'],
  },
  {
    entry: { bridge: 'src/bridge/main.ts' },
    format: ['esm'],
    dts: false,
    clean: false,
    sourcemap: false,
    // Fully bundle — the output is loaded as a string and served to the page,
    // so it must not contain any `import` statements.
    bundle: true,
    noExternal: [/.*/],
  },
]);
