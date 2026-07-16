// Valid message types from the bridge protocol (inlined to avoid chunk imports)
export const VALID_BRIDGE_TYPES = new Set([
  'component:mounted',
  'component:unmounted',
  'component:updated',
  'component:tree',
  'state:snapshot',
  'state:expanded',
  'graph:snapshot',
  'graph:update',
  'profiler:data',
  'trace:update',
  'bridge:ready',
  'picker:picked',
]);

export const VALID_PANEL_TYPES = new Set([
  'inspect:component',
  'state:edit',
  'state:expand',
  'profiler:start',
  'profiler:stop',
  'graph:request',
  'graph:subscribe',
  'graph:unsubscribe',
  'highlight:component',
  'open-in-editor',
  'tree:request',
  'picker:start',
  'picker:stop',
]);

export function isValidMessage(message: unknown, validTypes: Set<string>): boolean {
  return (
    typeof message === 'object' &&
    message !== null &&
    typeof (message as Record<string, unknown>).type === 'string' &&
    validTypes.has((message as Record<string, unknown>).type as string)
  );
}

/**
 * Panel ports must originate from this extension's own pages. Chrome already
 * prevents arbitrary web pages from calling chrome.runtime.connect on us, so
 * this is defense-in-depth against our own content script's port names being
 * confused, and against future manifest changes widening connectability.
 *
 * NOTE: the check is URL-prefix only, deliberately. The e2e suite opens the
 * panel page as a REGULAR TAB (sender.tab is set), so requiring "no tab" would
 * break legitimate panels. The extension origin is the trust anchor.
 */
export function isTrustedPanelSender(senderUrl: string | undefined, extensionId: string): boolean {
  return typeof senderUrl === 'string' && senderUrl.startsWith('chrome-extension://' + extensionId + '/');
}

type ShapeValidator = (m: Record<string, unknown>) => boolean;

const isOptionalString = (v: unknown) => v === undefined || typeof v === 'string';

const isStringArray = (v: unknown): boolean => Array.isArray(v) && v.every((p) => typeof p === 'string');

/**
 * Payload shape checks for panel→bridge messages, mirroring the interfaces in
 * @svelte-devtools/shared protocol.ts. DEFAULT-PERMISSIVE: a type present in
 * VALID_PANEL_TYPES but absent here passes on type alone — so a concurrent
 * plan adding a new panel type cannot be silently dropped by this map. Add a
 * validator when you add a type; never let absence mean rejection.
 */
const PANEL_SHAPE_VALIDATORS: Record<string, ShapeValidator> = {
  'inspect:component': (m) => typeof m.id === 'string',
  'state:edit': (m) => typeof m.signalId === 'string' && isStringArray(m.path),
  'state:expand': (m) => typeof m.rootId === 'string' && isStringArray(m.path),
  'graph:request': (m) => isOptionalString(m.componentId),
  // Added by plan 008 on main; validator ships ahead of the type landing in
  // this worktree's VALID_PANEL_TYPES (validators are only consulted after the
  // allowlist passes, so this entry is inert until the sets merge).
  'graph:subscribe': (m) => isOptionalString(m.componentId),
  'highlight:component': (m) => m.id === null || typeof m.id === 'string',
  'open-in-editor': (m) => typeof m.file === 'string' && typeof m.line === 'number' && typeof m.column === 'number',
};

export function isValidPanelMessage(message: unknown): boolean {
  if (!isValidMessage(message, VALID_PANEL_TYPES)) return false;
  const m = message as Record<string, unknown>;
  const validate = PANEL_SHAPE_VALIDATORS[m.type as string];
  return validate ? validate(m) : true;
}
