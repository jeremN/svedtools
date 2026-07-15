import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { ViteDevServer } from 'vite';

vi.mock('launch-editor', () => ({ default: vi.fn() }));

import launchEditor from 'launch-editor';
import { isAllowedSourceFile, isWithinRoot, createDevtoolsMiddleware } from './middleware.js';

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

// -- isWithinRoot (root-containment check) --
//
// Uses real temp dirs so realpath() resolution (incl. platform symlink
// quirks, e.g. macOS /var -> /private/var) is exercised for real, not mocked
// away. Covers the Windows-safe rewrite (relative() instead of a
// backslash-hostile startsWith(root + '/') check).

describe('isWithinRoot', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'sdt-root-'));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('allows a child file inside the root', async () => {
    await mkdir(join(root, 'src'));
    const file = join(root, 'src', 'App.svelte');
    await writeFile(file, '');
    expect(await isWithinRoot(file, root)).toBe(true);
  });

  it('allows the root directory itself', async () => {
    expect(await isWithinRoot(root, root)).toBe(true);
  });

  it('denies a sibling directory outside the root', async () => {
    const sibling = await mkdtemp(join(tmpdir(), 'sdt-sibling-'));
    try {
      const file = join(sibling, 'secret.ts');
      await writeFile(file, '');
      expect(await isWithinRoot(file, root)).toBe(false);
    } finally {
      await rm(sibling, { recursive: true, force: true });
    }
  });

  it('denies a directory that only shares the root as a string prefix', async () => {
    // `${root}-suffix` is NOT inside root, but a naive
    // startsWith(root + '/') check without proper segment boundaries could
    // be fooled by cases like this; relative() must not be.
    const suffixDir = `${root}-suffix`;
    await mkdir(suffixDir);
    try {
      const file = join(suffixDir, 'evil.ts');
      await writeFile(file, '');
      expect(await isWithinRoot(file, root)).toBe(false);
    } finally {
      await rm(suffixDir, { recursive: true, force: true });
    }
  });

  it('denies a symlink that escapes the root', async () => {
    const outside = await mkdtemp(join(tmpdir(), 'sdt-outside-'));
    try {
      const target = join(outside, 'secret.ts');
      await writeFile(target, '');
      const link = join(root, 'link.ts');
      await symlink(target, link);
      expect(await isWithinRoot(link, root)).toBe(false);
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
  });

  it('denies a nonexistent path', async () => {
    expect(await isWithinRoot(join(root, 'does-not-exist.ts'), root)).toBe(false);
  });
});

// -- WS handlers (open-in-editor, get-source) --
//
// createDevtoolsMiddleware() registers both handlers via server.ws.on(); a
// mock server captures the registered callbacks so they can be invoked
// directly here without a real Vite dev server or WebSocket connection.

describe('createDevtoolsMiddleware', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'sdt-ws-'));
    vi.mocked(launchEditor).mockClear();
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  type WsHandler = (data: unknown, client: { send: ReturnType<typeof vi.fn> }) => unknown;

  function createMockServer() {
    const handlers = new Map<string, WsHandler>();
    const middlewaresHandle = vi.fn();
    const server = {
      ws: {
        on: vi.fn((event: string, handler: WsHandler) => {
          handlers.set(event, handler);
        }),
      },
      config: { root },
      middlewares: { handle: middlewaresHandle },
    } as unknown as ViteDevServer;
    return { server, handlers, middlewaresHandle };
  }

  describe('svelte-devtools:open-in-editor', () => {
    it('calls launchEditor with the resolved path for a file inside root', async () => {
      await mkdir(join(root, 'src'));
      await writeFile(join(root, 'src', 'App.svelte'), '');
      const { server, handlers } = createMockServer();
      createDevtoolsMiddleware(server);
      const handler = handlers.get('svelte-devtools:open-in-editor')!;

      await handler({ file: 'src/App.svelte', line: 5, column: 12 }, { send: vi.fn() });

      expect(launchEditor).toHaveBeenCalledTimes(1);
      const target = vi.mocked(launchEditor).mock.calls[0][0];
      expect(target).toBe(`${resolve(root, 'src/App.svelte')}:5:12`);
    });

    it('does not call launchEditor for a path-traversal attempt outside root', async () => {
      const { server, handlers } = createMockServer();
      createDevtoolsMiddleware(server);
      const handler = handlers.get('svelte-devtools:open-in-editor')!;

      await handler({ file: '../../etc/passwd', line: 1, column: 1 }, { send: vi.fn() });

      expect(launchEditor).not.toHaveBeenCalled();
    });

    it('does not call launchEditor when file is missing or non-string', async () => {
      const { server, handlers } = createMockServer();
      createDevtoolsMiddleware(server);
      const handler = handlers.get('svelte-devtools:open-in-editor')!;

      await handler({ file: undefined, line: 1, column: 1 }, { send: vi.fn() });
      await handler({ file: 42, line: 1, column: 1 }, { send: vi.fn() });
      await handler({ file: '', line: 1, column: 1 }, { send: vi.fn() });

      expect(launchEditor).not.toHaveBeenCalled();
    });

    it('coerces non-integer line/column to 1', async () => {
      await writeFile(join(root, 'App.svelte'), '');
      const { server, handlers } = createMockServer();
      createDevtoolsMiddleware(server);
      const handler = handlers.get('svelte-devtools:open-in-editor')!;

      await handler({ file: 'App.svelte', line: 3.5, column: Number.NaN }, { send: vi.fn() });

      const target = vi.mocked(launchEditor).mock.calls[0][0];
      expect(target).toBe(`${resolve(root, 'App.svelte')}:1:1`);
    });
  });

  describe('svelte-devtools:get-source', () => {
    it('sends file content for an allowed file inside root', async () => {
      await writeFile(join(root, 'App.svelte'), '<div>hi</div>');
      const { server, handlers } = createMockServer();
      createDevtoolsMiddleware(server);
      const handler = handlers.get('svelte-devtools:get-source')!;
      const client = { send: vi.fn() };

      await handler({ file: 'App.svelte' }, client);

      expect(client.send).toHaveBeenCalledWith('svelte-devtools:source', {
        file: 'App.svelte',
        content: '<div>hi</div>',
      });
    });

    it('replies with an error for a dotfile', async () => {
      await writeFile(join(root, '.env'), 'SECRET=1');
      const { server, handlers } = createMockServer();
      createDevtoolsMiddleware(server);
      const handler = handlers.get('svelte-devtools:get-source')!;
      const client = { send: vi.fn() };

      await handler({ file: '.env' }, client);

      expect(client.send).toHaveBeenCalledWith('svelte-devtools:source', {
        error: 'File type not allowed',
      });
    });

    it('replies with an error for a path outside root', async () => {
      const { server, handlers } = createMockServer();
      createDevtoolsMiddleware(server);
      const handler = handlers.get('svelte-devtools:get-source')!;
      const client = { send: vi.fn() };

      await handler({ file: '../../etc/passwd' }, client);

      expect(client.send).toHaveBeenCalledWith('svelte-devtools:source', {
        error: 'Path outside project root',
      });
    });
  });
});
