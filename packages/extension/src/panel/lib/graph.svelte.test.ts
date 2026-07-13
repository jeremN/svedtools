import { describe, it, expect, beforeEach } from 'vitest';
import {
  processGraphMessage,
  getGraphNodes,
  getGraphEdges,
  getSelectedNodeId,
  selectGraphNode,
  getComponentFilter,
  setComponentFilter,
  resetGraphState,
} from './graph.svelte.js';
import type { ReactiveGraphNode, ReactiveGraphEdge } from '@svelte-devtools/shared';

function node(overrides: Partial<ReactiveGraphNode> = {}): ReactiveGraphNode {
  return {
    id: 'n1',
    type: 'source',
    label: 'count',
    value: 0,
    dirty: false,
    componentId: 'c1',
    ...overrides,
  };
}

function edge(overrides: Partial<ReactiveGraphEdge> = {}): ReactiveGraphEdge {
  return { from: 'n1', to: 'n2', active: true, ...overrides };
}

describe('graph store', () => {
  beforeEach(() => {
    resetGraphState();
  });

  describe('graph:snapshot', () => {
    it('replaces nodes and edges wholesale', () => {
      const nodes = [node({ id: 'n1' })];
      const edges = [edge({ from: 'n1', to: 'n2' })];
      processGraphMessage({ type: 'graph:snapshot', nodes, edges });
      expect(getGraphNodes()).toEqual(nodes);
      expect(getGraphEdges()).toEqual(edges);

      // A second snapshot fully replaces the first, even if disjoint.
      const nodes2 = [node({ id: 'n9' })];
      processGraphMessage({ type: 'graph:snapshot', nodes: nodes2, edges: [] });
      expect(getGraphNodes()).toEqual(nodes2);
      expect(getGraphEdges()).toEqual([]);
    });
  });

  describe('graph:update', () => {
    it('merges updated nodes by id, preserving untouched nodes', () => {
      processGraphMessage({
        type: 'graph:snapshot',
        nodes: [node({ id: 'n1', value: 0 }), node({ id: 'n2', value: 1 })],
        edges: [],
      });

      processGraphMessage({
        type: 'graph:update',
        updatedNodes: [node({ id: 'n1', value: 42 })],
        updatedEdges: [],
      });

      const nodes = getGraphNodes();
      expect(nodes).toHaveLength(2);
      expect(nodes.find((n) => n.id === 'n1')?.value).toBe(42);
      expect(nodes.find((n) => n.id === 'n2')?.value).toBe(1);
    });

    it('adds new nodes not previously present', () => {
      processGraphMessage({ type: 'graph:snapshot', nodes: [node({ id: 'n1' })], edges: [] });
      processGraphMessage({
        type: 'graph:update',
        updatedNodes: [node({ id: 'n2' })],
        updatedEdges: [],
      });
      expect(
        getGraphNodes()
          .map((n) => n.id)
          .sort(),
      ).toEqual(['n1', 'n2']);
    });

    it('merges edges by composite key `${from}->${to}` and dedupes on repeat', () => {
      processGraphMessage({
        type: 'graph:snapshot',
        nodes: [],
        edges: [edge({ from: 'a', to: 'b', active: true })],
      });

      // Same from->to arrives again with a different `active` value — should
      // overwrite the existing edge, not duplicate it.
      processGraphMessage({
        type: 'graph:update',
        updatedNodes: [],
        updatedEdges: [edge({ from: 'a', to: 'b', active: false })],
      });

      const edges = getGraphEdges();
      expect(edges).toHaveLength(1);
      expect(edges[0]).toEqual(edge({ from: 'a', to: 'b', active: false }));
    });

    it('treats a different `to` with the same `from` as a distinct edge', () => {
      processGraphMessage({
        type: 'graph:update',
        updatedNodes: [],
        updatedEdges: [edge({ from: 'a', to: 'b' }), edge({ from: 'a', to: 'c' })],
      });
      expect(getGraphEdges()).toHaveLength(2);
    });
  });

  describe('selection + filter', () => {
    it('selectGraphNode sets and clears the selected node id', () => {
      expect(getSelectedNodeId()).toBeNull();
      selectGraphNode('n1');
      expect(getSelectedNodeId()).toBe('n1');
      selectGraphNode(null);
      expect(getSelectedNodeId()).toBeNull();
    });

    it('setComponentFilter sets and clears the component filter', () => {
      expect(getComponentFilter()).toBeNull();
      setComponentFilter('c1');
      expect(getComponentFilter()).toBe('c1');
      setComponentFilter(null);
      expect(getComponentFilter()).toBeNull();
    });
  });

  describe('resetGraphState', () => {
    it('clears nodes, edges, selection, and filter', () => {
      processGraphMessage({ type: 'graph:snapshot', nodes: [node()], edges: [edge()] });
      selectGraphNode('n1');
      setComponentFilter('c1');

      resetGraphState();

      expect(getGraphNodes()).toEqual([]);
      expect(getGraphEdges()).toEqual([]);
      expect(getSelectedNodeId()).toBeNull();
      expect(getComponentFilter()).toBeNull();
    });
  });
});
