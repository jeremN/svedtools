import type { ViteDevServer } from 'vite';
import { readFile, realpath } from 'node:fs/promises';
import { resolve, relative, isAbsolute, extname, basename } from 'node:path';
import launchEditor from 'launch-editor';

/**
 * Validates that a file path is within the project root,
 * resolving symlinks to prevent traversal.
 *
 * Uses node:path's relative() rather than a POSIX-style forward-slash
 * prefix check so this is correct on Windows too: realpath() there returns
 * backslash-separated paths, so a forward-slash-based prefix check never
 * matches a real child path and silently rejects every file.
 */
export async function isWithinRoot(filePath: string, root: string): Promise<boolean> {
  try {
    const resolvedPath = await realpath(filePath);
    const resolvedRoot = await realpath(root);
    const rel = relative(resolvedRoot, resolvedPath);
    return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
  } catch {
    return false;
  }
}

/** Extensions the panel can meaningfully display as source. */
const ALLOWED_SOURCE_EXTENSIONS = new Set([
  '.svelte',
  '.js',
  '.mjs',
  '.cjs',
  '.jsx',
  '.ts',
  '.mts',
  '.cts',
  '.tsx',
  '.css',
  '.scss',
  '.sass',
  '.less',
]);

/**
 * Secure-by-default positive allowlist: only recognized source files may be
 * read. This keeps get-source from being used to exfiltrate `.env`, keys,
 * `.git/*`, etc. — the things Vite's own `server.fs.deny` normally protects —
 * since we go straight to the filesystem and bypass that layer. Dotfiles are
 * rejected outright as defense-in-depth on top of the extension check.
 */
export function isAllowedSourceFile(filePath: string): boolean {
  if (basename(filePath).startsWith('.')) return false;
  return ALLOWED_SOURCE_EXTENSIONS.has(extname(filePath).toLowerCase());
}

/**
 * Adds WebSocket handlers for DevTools features:
 * - open-in-editor: Opens a source file in the user's editor
 * - get-source: Returns file content for source display in the panel
 */
export function createDevtoolsMiddleware(server: ViteDevServer): void {
  server.ws.on('svelte-devtools:open-in-editor', async (data: { file: string; line: number; column: number }) => {
    const { file, line, column } = data;
    if (!file || typeof file !== 'string') return;

    // Resolve and validate path is within project root
    const root = resolve(server.config.root);
    const filePath = isAbsolute(file) ? file : resolve(root, file);

    if (!(await isWithinRoot(filePath, root))) return;

    // line/column arrive untrusted over the wire; coerce to safe integers
    // before interpolating them raw into the query string.
    const safeLine = Number.isInteger(line) ? line : 1;
    const safeColumn = Number.isInteger(column) ? column : 1;

    // Call launch-editor directly — the same package Vite's own
    // /__open-in-editor endpoint delegates to. Routing a synthetic req/res
    // through server.middlewares.handle() breaks on middlewares that expect a
    // real ServerResponse (Vite 8's stack throws "res argument is required"
    // before the editor middleware is ever reached).
    launchEditor(`${filePath}:${safeLine}:${safeColumn}`, undefined, (fileName, errorMsg) => {
      console.warn(`[svelte-devtools] failed to open ${fileName} in editor: ${errorMsg ?? 'unknown error'}`);
    });
  });

  server.ws.on('svelte-devtools:get-source', async (data: { file: string }, client) => {
    const { file } = data;
    if (!file || typeof file !== 'string') {
      client.send('svelte-devtools:source', { error: 'Invalid file path' });
      return;
    }

    const root = resolve(server.config.root);
    const filePath = isAbsolute(file) ? file : resolve(root, file);

    if (!(await isWithinRoot(filePath, root))) {
      client.send('svelte-devtools:source', { error: 'Path outside project root' });
      return;
    }

    // Source-only allowlist: the panel only ever displays source files, so
    // refuse anything else. This stops get-source from reading `.env`, keys,
    // `.git/*`, etc. that Vite's `server.fs.deny` normally guards.
    if (!isAllowedSourceFile(filePath)) {
      client.send('svelte-devtools:source', { error: 'File type not allowed' });
      return;
    }

    try {
      const content = await readFile(filePath, 'utf-8');
      client.send('svelte-devtools:source', { file, content });
    } catch {
      client.send('svelte-devtools:source', { error: `File not found: ${file}` });
    }
  });
}
