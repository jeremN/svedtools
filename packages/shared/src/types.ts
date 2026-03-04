/** Unique identifier for tracked entities */
export type NodeId = string;

/** Source location from __svelte_meta */
export interface SourceLocation {
  file: string;
  line: number;
  column: number;
}

/** A node in the component tree */
export interface ComponentNode {
  id: NodeId;
  name: string;
  filename: string | null;
  children: NodeId[];
  parentId: NodeId | null;
  meta: SourceLocation | null;
  /** Signal IDs owned by this component */
  stateIds: NodeId[];
  /** Effect IDs owned by this component */
  effectIds: NodeId[];
  /** Most recent render duration in ms */
  renderDuration: number | null;
}

/** Type of a reactive graph node */
export type ReactiveNodeType = 'source' | 'derived' | 'effect';

/** A node in the reactivity dependency graph */
export interface ReactiveGraphNode {
  id: NodeId;
  type: ReactiveNodeType;
  label: string | null;
  /** Serialized current value (null for effects) */
  value: SerializedValue | null;
  /** Whether the signal is dirty (wv > rv) */
  dirty: boolean;
  /** Owning component ID */
  componentId: NodeId | null;
}

/** An edge in the reactivity dependency graph */
export interface ReactiveGraphEdge {
  /** Source node ID (dependency) */
  from: NodeId;
  /** Target node ID (dependent) */
  to: NodeId;
  /** Whether this edge was active in the last update */
  active: boolean;
}

/** Timing data for a single component render */
export interface RenderTiming {
  componentId: NodeId;
  name: string;
  startTime: number;
  duration: number;
  /** False for initial mount, true for re-renders */
  isRerender: boolean;
}

/** A single step in an update propagation chain */
export interface UpdateChainStep {
  signalId: NodeId;
  signalLabel: string | null;
  oldValue: SerializedValue | null;
  newValue: SerializedValue | null;
  effectId: NodeId | null;
}

/** A DOM mutation correlated with an update */
export interface DomMutation {
  type: 'childList' | 'attributes' | 'characterData';
  targetTag: string;
  targetId: string | null;
  targetClass: string | null;
  attributeName: string | null;
  /** Summary of what changed */
  summary: string;
}

/** Full trace of why an update happened */
export interface UpdateTrace {
  id: NodeId;
  timestamp: number;
  rootCause: {
    signalId: NodeId;
    signalLabel: string | null;
    componentId: NodeId | null;
    componentName: string | null;
    stackTrace: string | null;
  };
  chain: UpdateChainStep[];
  domMutations: DomMutation[];
}

// -- Serialization types --

export type SerializedPrimitive = string | number | boolean | null | undefined;

export interface SerializedObject {
  __type: 'object';
  preview: string;
  /** Present if the object has expandable children */
  childCount?: number;
  /** Path for lazy fetching of children */
  path?: string;
}

export interface SerializedArray {
  __type: 'array';
  length: number;
  preview: string;
  path?: string;
}

export interface SerializedDomNode {
  __type: 'dom';
  tag: string;
  id: string | null;
  className: string | null;
}

export interface SerializedCircularRef {
  __type: 'circular';
  path: string;
}

export interface SerializedTruncated {
  __type: 'truncated';
  reason: string;
}

export type SerializedValue =
  | SerializedPrimitive
  | SerializedObject
  | SerializedArray
  | SerializedDomNode
  | SerializedCircularRef
  | SerializedTruncated;
