/**
 * Panel-initiated state edits: navigate a LIVE value along `path` and assign
 * `value` at the leaf. Mirrors serializeChildrenAtPath's navigation (see
 * serializer.ts) for plain objects and arrays, but deliberately NOT Map/Set:
 * expansion stringifies Map keys lossily (String(k)) and Set members only
 * have positional indices, so an edit could target the wrong entry — refuse
 * instead. The leaf must already exist (own key / in-bounds integer index):
 * the panel only offers edits on rendered leaves, so a missing key means the
 * value drifted since render - refuse rather than create.
 *
 * Assignment happens through the live object; for $state objects that is
 * Svelte's reactive proxy, whose set trap schedules reactions — no internals
 * access needed here. Never throws (hostile getters/setters degrade to
 * false).
 *
 * Returns true only when the assignment was performed.
 */
export function applyEditAtPath(root: unknown, path: string[], value: unknown): boolean {
  if (path.length === 0) return false;
  let current: unknown = root;
  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i];
    if (current === null || typeof current !== 'object') return false;
    const container = current as object;
    if (container instanceof Map || container instanceof Set) return false;
    try {
      if (Array.isArray(container)) {
        const idx = Number(key);
        if (!Number.isInteger(idx) || idx < 0 || idx >= container.length) return false;
        current = container[idx];
      } else {
        if (!Object.prototype.hasOwnProperty.call(container, key)) return false;
        current = (container as Record<string, unknown>)[key];
      }
    } catch {
      return false;
    }
  }
  if (current === null || typeof current !== 'object') return false;
  const parent = current as object;
  if (parent instanceof Map || parent instanceof Set) return false;
  const leafKey = path[path.length - 1];
  try {
    if (Array.isArray(parent)) {
      const idx = Number(leafKey);
      if (!Number.isInteger(idx) || idx < 0 || idx >= parent.length) return false;
      parent[idx] = value;
      return true;
    }
    if (!Object.prototype.hasOwnProperty.call(parent, leafKey)) return false;
    (parent as Record<string, unknown>)[leafKey] = value;
    return true;
  } catch {
    return false;
  }
}
