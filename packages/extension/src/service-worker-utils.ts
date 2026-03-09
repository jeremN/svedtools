// Valid message types from the bridge protocol (inlined to avoid chunk imports)
export const VALID_BRIDGE_TYPES = new Set([
  'component:mounted',
  'component:unmounted',
  'component:updated',
  'component:tree',
  'state:snapshot',
  'graph:snapshot',
  'graph:update',
  'profiler:data',
  'trace:update',
  'bridge:ready',
]);

export const VALID_PANEL_TYPES = new Set([
  'inspect:component',
  'state:edit',
  'profiler:start',
  'profiler:stop',
  'graph:request',
  'highlight:component',
  'open-in-editor',
]);

export function isValidMessage(message: unknown, validTypes: Set<string>): boolean {
  return (
    typeof message === 'object' &&
    message !== null &&
    typeof (message as Record<string, unknown>).type === 'string' &&
    validTypes.has((message as Record<string, unknown>).type as string)
  );
}
