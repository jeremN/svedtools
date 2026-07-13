import { describe, it, expect, beforeEach } from 'vitest';
import {
  processMessage,
  getComponentMap,
  getRootIds,
  getSelectedId,
  selectComponent,
  getStateSnapshot,
  resetState,
} from './components.svelte.js';
import type { ComponentNode } from '@svelte-devtools/shared';

function node(overrides: Partial<ComponentNode> = {}): ComponentNode {
  return {
    id: 'c1',
    name: 'Counter',
    filename: 'Counter.svelte',
    children: [],
    parentId: null,
    meta: null,
    stateIds: [],
    effectIds: [],
    renderDuration: null,
    ...overrides,
  };
}

describe('components store', () => {
  beforeEach(() => {
    resetState();
  });

  describe('component:mounted', () => {
    it('adds a root node to rootIds and the component map', () => {
      processMessage({ type: 'component:mounted', node: node({ id: 'c1', parentId: null }) });
      expect(getRootIds()).toEqual(['c1']);
      expect(getComponentMap()['c1']).toBeDefined();
    });

    it('links a child to its parent', () => {
      processMessage({ type: 'component:mounted', node: node({ id: 'p1', parentId: null }) });
      processMessage({ type: 'component:mounted', node: node({ id: 'c1', parentId: 'p1' }) });
      expect(getComponentMap()['p1'].children).toEqual(['c1']);
      expect(getRootIds()).toEqual(['p1']);
    });

    it('dedupes a repeated mount of the same root id', () => {
      processMessage({ type: 'component:mounted', node: node({ id: 'c1', parentId: null }) });
      processMessage({ type: 'component:mounted', node: node({ id: 'c1', parentId: null }) });
      expect(getRootIds()).toEqual(['c1']);
    });

    it('dedupes a repeated mount of the same child id', () => {
      processMessage({ type: 'component:mounted', node: node({ id: 'p1', parentId: null }) });
      processMessage({ type: 'component:mounted', node: node({ id: 'c1', parentId: 'p1' }) });
      processMessage({ type: 'component:mounted', node: node({ id: 'c1', parentId: 'p1' }) });
      expect(getComponentMap()['p1'].children).toEqual(['c1']);
    });
  });

  describe('component:unmounted', () => {
    it('removes the node from its parent children and from the map', () => {
      processMessage({ type: 'component:mounted', node: node({ id: 'p1', parentId: null }) });
      processMessage({ type: 'component:mounted', node: node({ id: 'c1', parentId: 'p1' }) });
      processMessage({ type: 'component:unmounted', id: 'c1' });

      expect(getComponentMap()['c1']).toBeUndefined();
      expect(getComponentMap()['p1'].children).toEqual([]);
    });

    it('removes a root node from rootIds', () => {
      processMessage({ type: 'component:mounted', node: node({ id: 'c1', parentId: null }) });
      processMessage({ type: 'component:unmounted', id: 'c1' });
      expect(getRootIds()).toEqual([]);
    });

    it('recursively removes descendants (handles out-of-order unmounts)', () => {
      processMessage({ type: 'component:mounted', node: node({ id: 'p1', parentId: null }) });
      processMessage({ type: 'component:mounted', node: node({ id: 'c1', parentId: 'p1' }) });
      processMessage({ type: 'component:mounted', node: node({ id: 'gc1', parentId: 'c1' }) });

      // Parent unmounts before its child's unmount message arrives.
      processMessage({ type: 'component:unmounted', id: 'p1' });

      expect(getComponentMap()['p1']).toBeUndefined();
      expect(getComponentMap()['c1']).toBeUndefined();
      expect(getComponentMap()['gc1']).toBeUndefined();
    });

    it('clears the selected id and state snapshot when the selected component unmounts', () => {
      processMessage({ type: 'component:mounted', node: node({ id: 'c1', parentId: null }) });
      selectComponent('c1');
      processMessage({
        type: 'state:snapshot',
        componentId: 'c1',
        signals: [{ id: 's1', label: 'count', type: 'state', value: 0 }],
      });
      expect(getStateSnapshot()).not.toBeNull();

      processMessage({ type: 'component:unmounted', id: 'c1' });

      expect(getSelectedId()).toBeNull();
      expect(getStateSnapshot()).toBeNull();
    });

    it('does not clear selection when an unrelated component unmounts', () => {
      processMessage({ type: 'component:mounted', node: node({ id: 'c1', parentId: null }) });
      processMessage({ type: 'component:mounted', node: node({ id: 'c2', parentId: null }) });
      selectComponent('c1');
      processMessage({ type: 'component:unmounted', id: 'c2' });
      expect(getSelectedId()).toBe('c1');
    });
  });

  describe('component:updated', () => {
    it('overwrites renderDuration when > 0', () => {
      processMessage({ type: 'component:mounted', node: node({ id: 'c1', renderDuration: null }) });
      processMessage({ type: 'component:updated', id: 'c1', renderDuration: 5.2, stateIds: [], effectIds: [] });
      expect(getComponentMap()['c1'].renderDuration).toBe(5.2);
    });

    it('does not overwrite renderDuration when the update is 0', () => {
      processMessage({ type: 'component:mounted', node: node({ id: 'c1', renderDuration: 3 }) });
      processMessage({ type: 'component:updated', id: 'c1', renderDuration: 0, stateIds: [], effectIds: [] });
      expect(getComponentMap()['c1'].renderDuration).toBe(3);
    });

    it('does not overwrite renderDuration when the update is negative', () => {
      processMessage({ type: 'component:mounted', node: node({ id: 'c1', renderDuration: 3 }) });
      processMessage({ type: 'component:updated', id: 'c1', renderDuration: -1, stateIds: [], effectIds: [] });
      expect(getComponentMap()['c1'].renderDuration).toBe(3);
    });

    it('is a no-op for an unknown component id', () => {
      processMessage({ type: 'component:updated', id: 'ghost', renderDuration: 5, stateIds: [], effectIds: [] });
      expect(getComponentMap()['ghost']).toBeUndefined();
    });
  });

  describe('component:tree', () => {
    it('bulk-replaces the map and rootIds', () => {
      processMessage({ type: 'component:mounted', node: node({ id: 'stale', parentId: null }) });

      processMessage({
        type: 'component:tree',
        nodes: [node({ id: 'p1', parentId: null, children: ['c1'] }), node({ id: 'c1', parentId: 'p1' })],
      });

      expect(getComponentMap()['stale']).toBeUndefined();
      expect(getRootIds()).toEqual(['p1']);
      expect(Object.keys(getComponentMap()).sort()).toEqual(['c1', 'p1']);
    });

    it('filters out children referencing nodes missing from the snapshot', () => {
      processMessage({
        type: 'component:tree',
        nodes: [node({ id: 'p1', parentId: null, children: ['missing', 'c1'] }), node({ id: 'c1', parentId: 'p1' })],
      });

      expect(getComponentMap()['p1'].children).toEqual(['c1']);
    });
  });

  describe('state:snapshot', () => {
    it('applies the snapshot only when it matches the selected component', () => {
      processMessage({ type: 'component:mounted', node: node({ id: 'c1', parentId: null }) });
      selectComponent('c1');

      processMessage({
        type: 'state:snapshot',
        componentId: 'other',
        signals: [{ id: 's1', label: 'count', type: 'state', value: 1 }],
      });
      expect(getStateSnapshot()).toBeNull();

      processMessage({
        type: 'state:snapshot',
        componentId: 'c1',
        signals: [{ id: 's1', label: 'count', type: 'state', value: 1 }],
      });
      expect(getStateSnapshot()).toEqual([{ id: 's1', label: 'count', type: 'state', value: 1 }]);
    });
  });

  describe('resetState', () => {
    it('clears map, roots, selection, filter, and snapshot', () => {
      processMessage({ type: 'component:mounted', node: node({ id: 'c1', parentId: null }) });
      selectComponent('c1');
      resetState();

      expect(getComponentMap()).toEqual({});
      expect(getRootIds()).toEqual([]);
      expect(getSelectedId()).toBeNull();
      expect(getStateSnapshot()).toBeNull();
    });
  });
});
