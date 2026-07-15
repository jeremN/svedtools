import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { resolve } from 'node:path';
import { copyFileSync, mkdirSync, existsSync } from 'node:fs';

/** Copies manifest.json and icons to dist after build */
function copyExtensionAssets(): import('vite').Plugin {
  return {
    name: 'copy-extension-assets',
    closeBundle() {
      const dist = resolve(__dirname, 'dist');
      // closeBundle also runs when the build errors before writing output, in
      // which case dist won't exist. Bail early so the real build error surfaces
      // instead of masking it with a misleading ENOENT from the copy below.
      if (!existsSync(dist)) return;
      copyFileSync(resolve(__dirname, 'manifest.json'), resolve(dist, 'manifest.json'));
      mkdirSync(resolve(dist, 'icons'), { recursive: true });
      // The manifest references these icons; Chrome refuses to load an unpacked
      // extension whose manifest points at missing files, so they must ship.
      for (const icon of ['icon-16.png', 'icon-48.png', 'icon-128.png']) {
        copyFileSync(resolve(__dirname, 'icons', icon), resolve(dist, 'icons', icon));
      }
    },
  };
}

export default defineConfig({
  // Relative paths in HTML — required for Chrome extensions (no HTTP server)
  base: '',
  plugins: [svelte(), copyExtensionAssets()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // Disable the modulepreload polyfill — not needed in extension context
    modulePreload: false,
    rollupOptions: {
      input: {
        panel: resolve(__dirname, 'src/panel/index.html'),
        devtools: resolve(__dirname, 'src/devtools.html'),
        'service-worker': resolve(__dirname, 'src/service-worker.ts'),
        'content-script': resolve(__dirname, 'src/content-script.ts'),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
});
