import type { ViteDevServer } from 'vite';
import { readFile, realpath } from 'node:fs/promises';
import { resolve, isAbsolute } from 'node:path';

/**
 * Validates that a file path is within the project root,
 * resolving symlinks to prevent traversal.
 */
async function isWithinRoot(filePath: string, root: string): Promise<boolean> {
  try {
    const resolvedPath = await realpath(filePath);
    const resolvedRoot = await realpath(root);
    return resolvedPath === resolvedRoot || resolvedPath.startsWith(resolvedRoot + '/');
  } catch {
    return false;
  }
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

    // Vite exposes __open-in-editor via middleware
    const url = `/__open-in-editor?file=${encodeURIComponent(file)}&line=${line}&column=${column}`;
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const req = { url, method: 'GET', headers: {} } as any;
    const res = {
      end() {},
      writeHead() {
        return this;
      },
      setHeader() {
        return this;
      },
    } as any;
    /* eslint-enable @typescript-eslint/no-explicit-any */
    server.middlewares.handle(req, res, () => {});
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

    try {
      const content = await readFile(filePath, 'utf-8');
      client.send('svelte-devtools:source', { file, content });
    } catch {
      client.send('svelte-devtools:source', { error: `File not found: ${file}` });
    }
  });
}
