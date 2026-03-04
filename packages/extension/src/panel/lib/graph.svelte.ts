import type {
	ReactiveGraphNode,
	ReactiveGraphEdge,
	NodeId,
	BridgeToPanelMessage,
} from '@svelte-devtools/shared';

// -- Reactive state --

let graphNodes: ReactiveGraphNode[] = $state([]);
let graphEdges: ReactiveGraphEdge[] = $state([]);
let selectedNodeId: NodeId | null = $state(null);
let componentFilter: NodeId | null = $state(null);

// -- Exported accessors --

export function getGraphNodes(): ReactiveGraphNode[] {
	return graphNodes;
}

export function getGraphEdges(): ReactiveGraphEdge[] {
	return graphEdges;
}

export function getSelectedNodeId(): NodeId | null {
	return selectedNodeId;
}

export function selectGraphNode(id: NodeId | null): void {
	selectedNodeId = id;
}

export function getComponentFilter(): NodeId | null {
	return componentFilter;
}

export function setComponentFilter(id: NodeId | null): void {
	componentFilter = id;
}

// -- Message processing --

export function processGraphMessage(message: BridgeToPanelMessage): void {
	switch (message.type) {
		case 'graph:snapshot': {
			graphNodes = message.nodes;
			graphEdges = message.edges;
			break;
		}

		case 'graph:update': {
			// Merge updated nodes into existing graph
			const nodeMap = new Map(graphNodes.map((n) => [n.id, n]));
			for (const updated of message.updatedNodes) {
				nodeMap.set(updated.id, updated);
			}
			graphNodes = Array.from(nodeMap.values());

			// Merge updated edges
			const edgeKey = (e: ReactiveGraphEdge) => `${e.from}->${e.to}`;
			const edgeMap = new Map(graphEdges.map((e) => [edgeKey(e), e]));
			for (const updated of message.updatedEdges) {
				edgeMap.set(edgeKey(updated), updated);
			}
			graphEdges = Array.from(edgeMap.values());
			break;
		}
	}
}

// -- Reset --

export function resetGraphState(): void {
	graphNodes = [];
	graphEdges = [];
	selectedNodeId = null;
	componentFilter = null;
}
