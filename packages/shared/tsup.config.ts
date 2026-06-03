import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  // Declarations are emitted by `tsc -p tsconfig.build.json` (see build script) —
  // tsup's dts pipeline injects a deprecated `baseUrl` that errors on TS 6+.
  dts: false,
  clean: true,
  sourcemap: true,
});
