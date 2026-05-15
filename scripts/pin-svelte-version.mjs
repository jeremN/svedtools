#!/usr/bin/env node
/**
 * Pins the workspace-wide Svelte version via pnpm.overrides.
 *
 * Reads the target version from $SVELTE_VERSION and rewrites the root
 * package.json's `pnpm.overrides.svelte` field. Used by the compat CI
 * matrix to test against multiple Svelte minors without changing the
 * lockfile in main.
 *
 * Usage: SVELTE_VERSION=5.20.0 node scripts/pin-svelte-version.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';

const target = process.env.SVELTE_VERSION;
if (!target) {
  console.error('SVELTE_VERSION env var is required');
  process.exit(1);
}

const pkgPath = new URL('../package.json', import.meta.url);
const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
pkg.pnpm = pkg.pnpm ?? {};
pkg.pnpm.overrides = pkg.pnpm.overrides ?? {};
pkg.pnpm.overrides.svelte = target;
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
console.log(`Pinned svelte → ${target} via pnpm.overrides`);
