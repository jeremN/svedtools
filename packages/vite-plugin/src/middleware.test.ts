import { describe, it, expect } from 'vitest';
import { isAllowedSourceFile } from './middleware.js';

// -- Source allowlist (Fix 1) --
//
// isAllowedSourceFile is the secure-by-default gate the get-source handler
// uses so it can't be coaxed into reading `.env`, keys, `.git/*`, etc.

describe('isAllowedSourceFile', () => {
  it('allows recognized source files', () => {
    expect(isAllowedSourceFile('/proj/src/App.svelte')).toBe(true);
    expect(isAllowedSourceFile('/proj/src/foo.ts')).toBe(true);
    expect(isAllowedSourceFile('/proj/src/foo.js')).toBe(true);
    expect(isAllowedSourceFile('/proj/styles/main.css')).toBe(true);
  });

  it('denies secrets, dotfiles, and non-source files', () => {
    expect(isAllowedSourceFile('/proj/.env')).toBe(false);
    expect(isAllowedSourceFile('/proj/.env.local')).toBe(false);
    expect(isAllowedSourceFile('/proj/.git/config')).toBe(false);
    expect(isAllowedSourceFile('/proj/key.pem')).toBe(false);
    expect(isAllowedSourceFile('/proj/cert.crt')).toBe(false);
    expect(isAllowedSourceFile('/proj/secrets.json')).toBe(false);
    expect(isAllowedSourceFile('/proj/README.md')).toBe(false);
    expect(isAllowedSourceFile('/proj/.npmrc')).toBe(false);
  });

  it('matches extensions case-insensitively', () => {
    expect(isAllowedSourceFile('/proj/Foo.TS')).toBe(true);
  });
});
