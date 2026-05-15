import type {
  NodeId,
  ComponentNode,
  ReactiveGraphNode,
  ReactiveGraphEdge,
  RenderTiming,
  UpdateTrace,
  SerializedValue,
} from './types.js';

// -- Bridge → Panel messages (from page to extension) --

export interface ComponentMountedMessage {
  type: 'component:mounted';
  node: ComponentNode;
}

export interface ComponentUnmountedMessage {
  type: 'component:unmounted';
  id: NodeId;
}

export interface ComponentUpdatedMessage {
  type: 'component:updated';
  id: NodeId;
  renderDuration: number;
  stateIds: NodeId[];
  effectIds: NodeId[];
}

export interface StateSnapshotMessage {
  type: 'state:snapshot';
  componentId: NodeId;
  signals: Array<{
    id: NodeId;
    label: string | null;
    type: 'state' | 'derived' | 'props';
    value: SerializedValue;
  }>;
}

export interface GraphSnapshotMessage {
  type: 'graph:snapshot';
  nodes: ReactiveGraphNode[];
  edges: ReactiveGraphEdge[];
}

export interface GraphUpdateMessage {
  type: 'graph:update';
  updatedNodes: ReactiveGraphNode[];
  updatedEdges: ReactiveGraphEdge[];
}

export interface ProfilerDataMessage {
  type: 'profiler:data';
  timings: RenderTiming[];
  effectTimings: Array<{
    effectId: NodeId;
    label: string | null;
    duration: number;
    depsCount: number;
  }>;
}

export interface TraceUpdateMessage {
  type: 'trace:update';
  trace: UpdateTrace;
}

export interface BridgeReadyMessage {
  type: 'bridge:ready';
  svelteVersion: string;
  protocolVersion: number;
  /**
   * True when the running Svelte version is outside the range the bridge was
   * tested against (see TESTED_SVELTE_RANGE in vite-plugin/src/bridge/compat.ts).
   * Panel shows a warning banner when set. Optional/additive — safe at protocol v1.
   */
  untested?: boolean;
}

export interface ComponentTreeSnapshotMessage {
  type: 'component:tree';
  nodes: ComponentNode[];
}

/** Current protocol version — increment on breaking changes */
export const PROTOCOL_VERSION = 1;

/** All messages sent from bridge (page) to panel (extension) */
export type BridgeToPanelMessage =
  | ComponentMountedMessage
  | ComponentUnmountedMessage
  | ComponentUpdatedMessage
  | ComponentTreeSnapshotMessage
  | StateSnapshotMessage
  | GraphSnapshotMessage
  | GraphUpdateMessage
  | ProfilerDataMessage
  | TraceUpdateMessage
  | BridgeReadyMessage;

// -- Panel → Bridge messages (from extension to page) --

export interface InspectComponentRequest {
  type: 'inspect:component';
  id: NodeId;
}

export interface StateEditRequest {
  type: 'state:edit';
  signalId: NodeId;
  path: string[];
  value: unknown;
}

export interface ProfilerStartRequest {
  type: 'profiler:start';
}

export interface ProfilerStopRequest {
  type: 'profiler:stop';
}

export interface GraphRequestMessage {
  type: 'graph:request';
  /** Optional: filter by component */
  componentId?: NodeId;
}

export interface HighlightComponentRequest {
  type: 'highlight:component';
  id: NodeId | null;
}

export interface OpenInEditorRequest {
  type: 'open-in-editor';
  file: string;
  line: number;
  column: number;
}

/** All messages sent from panel (extension) to bridge (page) */
export type PanelToBridgeMessage =
  | InspectComponentRequest
  | StateEditRequest
  | ProfilerStartRequest
  | ProfilerStopRequest
  | GraphRequestMessage
  | HighlightComponentRequest
  | OpenInEditorRequest;

// -- Extension-internal messages (not sent over postMessage wire) --

export interface PanelInitMessage {
  type: 'panel:init';
  tabId: number;
}

// -- Wire format (wraps messages for postMessage transport) --

export interface WireMessage<T = BridgeToPanelMessage | PanelToBridgeMessage> {
  source: 'svelte-devtools-pro';
  payload: T;
}

/** All valid message type discriminants */
const VALID_MESSAGE_TYPES = new Set([
  'component:mounted',
  'component:unmounted',
  'component:updated',
  'component:tree',
  'state:snapshot',
  'state:edit',
  'graph:snapshot',
  'graph:update',
  'graph:request',
  'profiler:start',
  'profiler:stop',
  'profiler:data',
  'trace:update',
  'bridge:ready',
  'inspect:component',
  'highlight:component',
  'open-in-editor',
]);

/** Type guard for our wire messages — validates source AND payload shape */
export function isDevToolsMessage(data: unknown): data is WireMessage {
  if (
    typeof data !== 'object' ||
    data === null ||
    !('source' in data) ||
    (data as Record<string, unknown>).source !== 'svelte-devtools-pro'
  ) {
    return false;
  }
  const payload = (data as Record<string, unknown>).payload;
  return (
    typeof payload === 'object' &&
    payload !== null &&
    typeof (payload as Record<string, unknown>).type === 'string' &&
    VALID_MESSAGE_TYPES.has((payload as Record<string, unknown>).type as string)
  );
}
