import type { UpdateTrace, NodeId, BridgeToPanelMessage } from '@svelte-devtools/shared';

const MAX_TRACES = 200;

// -- Reactive state --

let traces: UpdateTrace[] = $state([]);
let selectedTraceId: NodeId | null = $state(null);

// -- Exported accessors --

export function getTraces(): UpdateTrace[] {
	return traces;
}

export function getSelectedTraceId(): NodeId | null {
	return selectedTraceId;
}

export function getSelectedTrace(): UpdateTrace | null {
	if (!selectedTraceId) return null;
	return traces.find((t) => t.id === selectedTraceId) ?? null;
}

// -- Actions --

export function selectTrace(id: NodeId | null): void {
	selectedTraceId = id;
}

export function clearTraces(): void {
	traces = [];
	selectedTraceId = null;
}

// -- Message processing --

export function processTraceMessage(message: BridgeToPanelMessage): void {
	if (message.type !== 'trace:update') return;
	// Ring buffer: evict oldest when full
	if (traces.length >= MAX_TRACES) {
		traces = [...traces.slice(-(MAX_TRACES - 1)), message.trace];
	} else {
		traces = [...traces, message.trace];
	}
}

// -- Reset --

export function resetTracerState(): void {
	traces = [];
	selectedTraceId = null;
}
