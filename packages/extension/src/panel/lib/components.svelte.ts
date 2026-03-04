import type {
	ComponentNode,
	NodeId,
	BridgeToPanelMessage,
	SerializedValue,
} from '@svelte-devtools/shared';

// -- Reactive state --

let componentMap: Record<NodeId, ComponentNode> = $state({});
let rootIds: NodeId[] = $state([]);
let selectedId: NodeId | null = $state(null);
let searchFilter: string = $state('');
let stateSnapshot: Array<{
	id: NodeId;
	label: string | null;
	type: 'state' | 'derived' | 'props';
	value: SerializedValue;
}> | null = $state(null);

// -- Exported accessors --

export function getComponentMap(): Record<NodeId, ComponentNode> {
	return componentMap;
}

export function getRootIds(): NodeId[] {
	return rootIds;
}

export function getSelectedId(): NodeId | null {
	return selectedId;
}

export function getSearchFilter(): string {
	return searchFilter;
}

export function setSearchFilter(value: string): void {
	searchFilter = value;
}

export function selectComponent(id: NodeId | null): void {
	selectedId = id;
}

export function getStateSnapshot(): typeof stateSnapshot {
	return stateSnapshot;
}

// -- Message processing --

export function processMessage(message: BridgeToPanelMessage): void {
	switch (message.type) {
		case 'component:mounted': {
			const node = message.node;
			componentMap[node.id] = node;

			if (node.parentId === null) {
				rootIds.push(node.id);
			} else {
				const parent = componentMap[node.parentId];
				if (parent) {
					parent.children.push(node.id);
				}
			}
			break;
		}

		case 'component:unmounted': {
			const id = message.id;
			const node = componentMap[id];

			if (node) {
				// Remove from parent's children
				if (node.parentId !== null) {
					const parent = componentMap[node.parentId];
					if (parent) {
						const idx = parent.children.indexOf(id);
						if (idx !== -1) {
							parent.children.splice(idx, 1);
						}
					}
				}

				// Remove from rootIds
				const rootIdx = rootIds.indexOf(id);
				if (rootIdx !== -1) {
					rootIds.splice(rootIdx, 1);
				}

				// Recursively remove children (handles out-of-order unmount messages)
				removeRecursive(id);
			}

			// Clear selection if the unmounted component was selected
			if (selectedId === id) {
				selectedId = null;
				stateSnapshot = null;
			}
			break;
		}

		case 'component:updated': {
			const node = componentMap[message.id];
			if (node && message.renderDuration > 0) {
				node.renderDuration = message.renderDuration;
			}
			break;
		}

		case 'component:tree': {
			// Bulk replace — clear and rebuild from nodes array
			componentMap = {};
			rootIds = [];

			for (const node of message.nodes) {
				componentMap[node.id] = node;
				if (node.parentId === null) {
					rootIds.push(node.id);
				}
			}
			// Validate children references — drop any pointing to missing nodes
			for (const node of Object.values(componentMap)) {
				node.children = node.children.filter((childId: NodeId) => childId in componentMap);
			}
			break;
		}

		case 'state:snapshot': {
			if (message.componentId === selectedId) {
				stateSnapshot = message.signals;
			}
			break;
		}
	}
}

// -- Internal helpers --

function removeRecursive(id: NodeId): void {
	const node = componentMap[id];
	if (!node) return;
	for (const childId of [...node.children]) {
		removeRecursive(childId);
	}
	delete componentMap[id];
}

// -- Reset --

export function resetState(): void {
	componentMap = {};
	rootIds = [];
	selectedId = null;
	searchFilter = '';
	stateSnapshot = null;
}
