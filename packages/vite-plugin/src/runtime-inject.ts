import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

/**
 * Returns the source code for the runtime bridge that gets injected
 * into the page via the virtual module `virtual:svelte-devtools-bridge`.
 *
 * The actual bridge source lives in src/bridge/ and is built separately
 * by tsup into dist/bridge.js (see tsup.config.ts). This indirection
 * exists so the bridge can be written as ordinary TypeScript modules
 * with type-checking and a proper compat layer for Svelte internals.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const BRIDGE_PATH = join(__dirname, 'bridge.js');

let cached: string | null = null;

export function getBridgeCode(): string {
  if (cached !== null) return cached;
  try {
    cached = readFileSync(BRIDGE_PATH, 'utf-8');
    return cached;
  } catch (err) {
    throw new Error(
      `[svelte-devtools] Failed to read bridge bundle at ${BRIDGE_PATH}. ` +
        `Did you run \`pnpm build\` in packages/vite-plugin?`,
      { cause: err },
    );
  }
}
