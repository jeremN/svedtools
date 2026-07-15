import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const panelDir = fileURLToPath(new URL('.', import.meta.url));

function collectSvelteFiles(dir: string): string[] {
  const entries = readdirSync(dir, { recursive: true }) as string[];
  return entries.filter((entry) => entry.endsWith('.svelte')).map((entry) => join(dir, entry));
}

describe('no {@html} injection in the panel', () => {
  const files = collectSvelteFiles(panelDir);

  it('finds at least one .svelte file (guards against a broken walker)', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it('never uses {@html} — the panel renders bridge-derived data that the inspected page controls; text interpolation only', () => {
    const offenders = files.filter((file) => readFileSync(file, 'utf-8').includes('{@html'));
    expect(
      offenders,
      'Found {@html} usage. The panel renders values sourced from the inspected page (component ' +
        "state, labels, previews) which is attacker-controlled from the panel's perspective. Raw HTML " +
        'injection here is an XSS vector. If you have a legitimate need for {@html}, sanitize the input ' +
        'and update this test consciously.',
    ).toEqual([]);
  });
});
