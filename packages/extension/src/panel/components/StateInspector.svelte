<script lang="ts">
	import {
		getSelectedId,
		getStateSnapshot,
		getComponentMap,
	} from '../lib/components.svelte.js';
	import type {
		NodeId,
		SerializedValue,
		SerializedPrimitive,
		SerializedObject,
		SerializedArray,
	} from '@svelte-devtools/shared';

	let selectedId = $derived(getSelectedId());
	let stateSnapshot = $derived(getStateSnapshot());
	let componentMap = $derived(getComponentMap());
	let selectedComponent = $derived(selectedId ? componentMap[selectedId] : null);

	function typeBadgeLabel(type: 'state' | 'derived' | 'props'): string {
		if (type === 'state') return '$state';
		if (type === 'derived') return '$derived';
		return '$props';
	}

	function isSerializedComplex(
		value: SerializedValue,
	): value is Exclude<SerializedValue, SerializedPrimitive> {
		return typeof value === 'object' && value !== null && '__type' in value;
	}

	function formatDomNode(value: { __type: 'dom'; tag: string; id: string | null; className: string | null }): string {
		let result = `<${value.tag}`;
		if (value.id) result += `#${value.id}`;
		if (value.className) result += `.${value.className.split(' ').join('.')}`;
		result += '>';
		return result;
	}
</script>

{#snippet valueDisplay(value: SerializedValue, depth: number)}
	{#if value === null}
		<span class="value-null">null</span>
	{:else if value === undefined}
		<span class="value-null">undefined</span>
	{:else if typeof value === 'string'}
		<span class="value-string">"{value}"</span>
	{:else if typeof value === 'number'}
		<span class="value-number">{value}</span>
	{:else if typeof value === 'boolean'}
		<span class="value-boolean">{String(value)}</span>
	{:else if isSerializedComplex(value)}
		{#if value.__type === 'object'}
			<span class="value-object" title={(value as SerializedObject).preview}>
				{(value as SerializedObject).preview}
			</span>
		{:else if value.__type === 'array'}
			<span class="value-array" title={(value as SerializedArray).preview}>
				Array({(value as SerializedArray).length})
			</span>
		{:else if value.__type === 'dom'}
			<span class="value-dom">
				{formatDomNode(value as { __type: 'dom'; tag: string; id: string | null; className: string | null })}
			</span>
		{:else if value.__type === 'circular'}
			<span class="value-circular">[Circular]</span>
		{:else if value.__type === 'truncated'}
			<span class="value-truncated">{(value as { __type: 'truncated'; reason: string }).reason}</span>
		{/if}
	{/if}
{/snippet}

<div class="state-inspector">
	<div class="header">
		{#if selectedComponent}
			<span class="header-name">{selectedComponent.name}</span>
		{:else}
			<span class="header-muted">Select a component</span>
		{/if}
	</div>

	{#if !selectedId}
		<div class="empty-state">Select a component to inspect its state</div>
	{:else if stateSnapshot && stateSnapshot.length > 0}
		<div class="signal-list">
			{#each stateSnapshot as signal (signal.id)}
				<div class="signal-row">
					<span class="type-badge type-{signal.type}">
						{typeBadgeLabel(signal.type)}
					</span>
					{#if signal.label}
						<span class="signal-label">{signal.label}</span>
					{:else}
						<span class="signal-label unnamed">unnamed</span>
					{/if}
					<span class="signal-value">
						{@render valueDisplay(signal.value, 0)}
					</span>
				</div>
			{/each}
		</div>
	{:else}
		<div class="empty-state">No reactive state found</div>
	{/if}
</div>

<style>
	.state-inspector {
		padding: 12px;
		overflow-y: auto;
		font-family: monospace;
		color: #ccc;
	}

	.header {
		padding-bottom: 8px;
		margin-bottom: 8px;
		border-bottom: 1px solid #2a2a2a;
	}

	.header-name {
		font-weight: bold;
		font-size: 14px;
		color: #e8ab6a;
	}

	.header-muted {
		color: #666;
		font-style: italic;
		font-size: 13px;
	}

	.signal-list {
		display: flex;
		flex-direction: column;
	}

	.signal-row {
		display: flex;
		align-items: center;
		padding: 6px 8px;
		border-bottom: 1px solid #2a2a2a;
	}

	.type-badge {
		font-size: 10px;
		padding: 1px 6px;
		border-radius: 3px;
		font-weight: 600;
		font-family: monospace;
		flex-shrink: 0;
	}

	.type-state {
		background: #2d4a2d;
		color: #6abf6a;
	}

	.type-derived {
		background: #4a3d2d;
		color: #d4a843;
	}

	.type-props {
		background: #2d3a4a;
		color: #5b9bd5;
	}

	.signal-label {
		font-size: 13px;
		color: #ccc;
		margin-left: 8px;
		flex-shrink: 0;
	}

	.signal-label.unnamed {
		font-style: italic;
		color: #666;
	}

	.signal-value {
		font-size: 12px;
		font-family: monospace;
		margin-left: auto;
		max-width: 60%;
		text-align: right;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.value-string {
		color: #6a9955;
	}

	.value-number {
		color: #b5cea8;
	}

	.value-boolean {
		color: #569cd6;
	}

	.value-null {
		color: #808080;
		font-style: italic;
	}

	.value-object,
	.value-array {
		color: #ccc;
		cursor: default;
	}

	.value-dom {
		color: #c586c0;
	}

	.value-circular {
		color: #ce9178;
	}

	.value-truncated {
		color: #808080;
		font-style: italic;
	}

	.empty-state {
		color: #666;
		padding: 16px;
		text-align: center;
		font-style: italic;
		font-size: 13px;
	}
</style>
