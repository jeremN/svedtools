<script lang="ts">
  import {
    getComponentMap,
    getRootIds,
    getSelectedId,
    getSearchFilter,
    selectComponent,
  } from '../lib/components.svelte.js';
  import { send } from '../lib/connection.svelte.js';
  import type { NodeId, ComponentNode } from '@svelte-devtools/shared';

  let componentMap = $derived(getComponentMap());
  let rootIds = $derived(getRootIds());
  let selectedId = $derived(getSelectedId());
  let searchFilter = $derived(getSearchFilter());

  let expanded: Record<NodeId, boolean> = $state({});

  function isExpanded(id: NodeId): boolean {
    return expanded[id] !== false;
  }

  function toggleExpanded(id: NodeId): void {
    expanded[id] = !isExpanded(id);
  }

  function handleSelect(id: NodeId): void {
    selectComponent(id);
    send({ type: 'inspect:component', id });
  }

  function handleMouseEnter(id: NodeId): void {
    send({ type: 'highlight:component', id });
  }

  function handleMouseLeave(): void {
    send({ type: 'highlight:component', id: null });
  }

  function handleKeyDown(id: NodeId, event: KeyboardEvent): void {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleSelect(id);
    }
  }

  function basename(filepath: string): string {
    const parts = filepath.split('/');
    return parts[parts.length - 1];
  }

  function durationClass(ms: number): string {
    if (ms > 16) return 'duration-red';
    if (ms > 8) return 'duration-orange';
    return 'duration-normal';
  }

  let filteredNodes = $derived.by(() => {
    if (!searchFilter) return null;
    const filter = searchFilter.toLowerCase();
    const results: ComponentNode[] = [];
    for (const id of Object.keys(componentMap)) {
      const node = componentMap[id];
      if (node && node.name.toLowerCase().includes(filter)) {
        results.push(node);
      }
    }
    return results;
  });
</script>

{#snippet treeNode(id: NodeId, depth: number)}
  {@const node = componentMap[id]}
  {#if node}
    <div
      class="tree-row"
      class:selected={selectedId === id}
      style="padding-left: {depth * 16}px"
      role="treeitem"
      tabindex="-1"
      aria-selected={selectedId === id}
      aria-expanded={node.children.length > 0 ? isExpanded(id) : undefined}
      onclick={() => handleSelect(id)}
      onkeydown={(e) => handleKeyDown(id, e)}
      onmouseenter={() => handleMouseEnter(id)}
      onmouseleave={handleMouseLeave}
    >
      {#if node.children.length > 0}
        <button
          class="chevron"
          class:expanded={isExpanded(id)}
          aria-label={isExpanded(id) ? 'Collapse' : 'Expand'}
          onclick={(e) => {
            e.stopPropagation();
            toggleExpanded(id);
          }}
        >
          &#9654;
        </button>
      {:else}
        <span class="chevron-spacer"></span>
      {/if}

      <span class="component-name">{node.name}</span>

      {#if node.filename}
        <span class="filename">{basename(node.filename)}</span>
      {/if}

      {#if node.renderDuration != null}
        <span class="duration {durationClass(node.renderDuration)}">
          {node.renderDuration.toFixed(1)}ms
        </span>
      {/if}
    </div>

    {#if node.children.length > 0 && isExpanded(id)}
      {#each node.children as childId (childId)}
        {@render treeNode(childId, depth + 1)}
      {/each}
    {/if}
  {/if}
{/snippet}

{#snippet flatNode(node: ComponentNode)}
  <div
    class="tree-row"
    class:selected={selectedId === node.id}
    role="treeitem"
    tabindex="-1"
    aria-selected={selectedId === node.id}
    onclick={() => handleSelect(node.id)}
    onkeydown={(e) => handleKeyDown(node.id, e)}
    onmouseenter={() => handleMouseEnter(node.id)}
    onmouseleave={handleMouseLeave}
  >
    <span class="chevron-spacer"></span>
    <span class="component-name">{node.name}</span>

    {#if node.filename}
      <span class="filename">{basename(node.filename)}</span>
    {/if}

    {#if node.renderDuration != null}
      <span class="duration {durationClass(node.renderDuration)}">
        {node.renderDuration.toFixed(1)}ms
      </span>
    {/if}
  </div>
{/snippet}

<div class="tree-container" role="tree">
  {#if filteredNodes}
    {#if filteredNodes.length === 0}
      <div class="empty-state">No matching components</div>
    {:else}
      {#each filteredNodes as node (node.id)}
        {@render flatNode(node)}
      {/each}
    {/if}
  {:else if rootIds.length === 0}
    <div class="empty-state">No components detected</div>
  {:else}
    {#each rootIds as id (id)}
      {@render treeNode(id, 0)}
    {/each}
  {/if}
</div>

<style>
  .tree-container {
    overflow-y: auto;
    flex: 1;
    font-family: monospace;
    font-size: 13px;
    color: #ccc;
    user-select: none;
  }

  .tree-row {
    display: flex;
    align-items: center;
    height: 24px;
    padding-right: 8px;
    cursor: pointer;
    white-space: nowrap;
  }

  .tree-row:hover {
    background: #252525;
  }

  .tree-row.selected {
    background: #2a2d2e;
  }

  .chevron {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 12px;
    height: 12px;
    margin-right: 4px;
    padding: 0;
    border: none;
    background: none;
    color: #888;
    font-size: 8px;
    cursor: pointer;
    transition: transform 0.1s ease;
    transform: rotate(0deg);
    flex-shrink: 0;
  }

  .chevron.expanded {
    transform: rotate(90deg);
  }

  .chevron-spacer {
    display: inline-block;
    width: 12px;
    margin-right: 4px;
    flex-shrink: 0;
  }

  .component-name {
    color: #e8ab6a;
    font-weight: bold;
  }

  .filename {
    color: #666;
    font-size: 11px;
    margin-left: 6px;
  }

  .duration {
    margin-left: auto;
    font-size: 10px;
    padding: 1px 4px;
    border-radius: 3px;
    flex-shrink: 0;
  }

  .duration-normal {
    background: #2a3a2a;
    color: #8bc48b;
  }

  .duration-orange {
    background: #3a3020;
    color: #e8ab6a;
  }

  .duration-red {
    background: #3a2020;
    color: #e86a6a;
  }

  .empty-state {
    color: #666;
    padding: 16px;
    text-align: center;
    font-style: italic;
  }
</style>
