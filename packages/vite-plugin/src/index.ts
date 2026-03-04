import type { Plugin } from 'vite';
import { transformSvelteOutput } from './transform.js';
import { getBridgeCode } from './runtime-inject.js';
import { createDevtoolsMiddleware } from './middleware.js';

export interface SvelteDevtoolsOptions {
  /** Enable the plugin (default: true in dev) */
  enabled?: boolean;
}

/**
 * Vite plugin for Svelte DevTools Pro.
 * Add after `svelte()` in your Vite config.
 *
 * ```ts
 * import { svelte } from '@sveltejs/vite-plugin-svelte';
 * import { svelteDevtools } from 'vite-plugin-svelte-devtools';
 *
 * export default defineConfig({
 *   plugins: [svelte(), svelteDevtools()]
 * });
 * ```
 */
export function svelteDevtools(options: SvelteDevtoolsOptions = {}): Plugin[] {
  const { enabled = true } = options;
  if (!enabled) return [];

  const bridgePlugin: Plugin = {
    name: 'svelte-devtools:bridge',
    apply: 'serve',

    resolveId(id) {
      if (id === 'virtual:svelte-devtools-bridge') {
        return '\0virtual:svelte-devtools-bridge';
      }
    },

    load(id) {
      if (id === '\0virtual:svelte-devtools-bridge') {
        return getBridgeCode();
      }
    },

    transformIndexHtml() {
      return [
        {
          tag: 'script',
          attrs: { type: 'module', src: '/@id/__x00__virtual:svelte-devtools-bridge' },
          injectTo: 'head-prepend',
        },
      ];
    },

    configureServer(server) {
      createDevtoolsMiddleware(server);
    },
  };

  const transformPlugin: Plugin = {
    name: 'svelte-devtools:transform',
    apply: 'serve',
    enforce: 'post',

    transform(code, id) {
      // Only transform the main Svelte module, not style/template sub-requests
      const cleanId = id.split('?')[0];
      if (!cleanId.endsWith('.svelte')) return null;
      if (id.includes('type=style') || id.includes('type=template')) return null;

      const result = transformSvelteOutput(code, id);
      if (!result) return null;

      return {
        code: result.code,
        map: result.map,
      };
    },
  };

  return [bridgePlugin, transformPlugin];
}
