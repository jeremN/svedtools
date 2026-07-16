import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Guards the CVE-2025-24010 security contract. The plugin's dev-server WS
// handlers (open-in-editor / get-source) rely on Vite's built-in origin/token
// authentication at the WebSocket upgrade, which only exists from Vite 5.4.12 /
// 6.0.9 onward. Do NOT lower this floor without re-auditing finding F6 — an
// older Vite re-opens the cross-origin attack these handlers are safe from.
describe('vite peerDependency floor', () => {
  it('requires a token-era Vite (the CVE-2025-24010 fix)', () => {
    const pkgPath = fileURLToPath(new URL('../package.json', import.meta.url));
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as {
      peerDependencies: Record<string, string>;
    };
    expect(pkg.peerDependencies.vite).toBe('^5.4.12 || ^6.0.9 || ^7.0.0 || ^8.0.0');
  });
});
