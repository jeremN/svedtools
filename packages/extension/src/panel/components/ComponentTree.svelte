<script lang="ts">
  import {
    getComponentMap,
    getRootIds,
    getSelectedId,
    getSearchFilter,
    getPickerActive,
    setPickerActive,
    selectComponent,
  } from '../lib/components.svelte.js';
  import { send } from '../lib/connection.svelte.js';
  import type { NodeId, ComponentNode } from '@svelte-devtools/shared';

  let componentMap = $derived(getComponentMap());
  let rootIds = $derived(getRootIds());
  let selectedId = $derived(getSelectedId());
  let searchFilter = $derived(getSearchFilter());
  let pickerActive = $derived(getPickerActive());

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

  function handleOpenInEditor(event: MouseEvent, filename: string): void {
    event.stopPropagation();
    send({ type: 'open-in-editor', file: filename, line: 1, column: 1 });
  }

  function togglePicker(): void {
    if (pickerActive) {
      setPickerActive(false);
      send({ type: 'picker:stop' });
    } else {
      setPickerActive(true);
      send({ type: 'picker:start' });
    }
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

{#snippet fileInfo(filename: string)}
  <span class="filename">{basename(filename)}</span>
  <button
    class="source-btn"
    title="Open in editor"
    aria-label="Open {basename(filename)} in editor"
    onclick={(e) => handleOpenInEditor(e, filename)}
  >
    &#8599;
  </button>
{/snippet}

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
        {@render fileInfo(node.filename)}
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
      {@render fileInfo(node.filename)}
    {/if}

    {#if node.renderDuration != null}
      <span class="duration {durationClass(node.renderDuration)}">
        {node.renderDuration.toFixed(1)}ms
      </span>
    {/if}
  </div>
{/snippet}

<div class="toolbar">
  <button
    class="picker-btn"
    class:active={pickerActive}
    aria-pressed={pickerActive}
    title={pickerActive ? 'Cancel element picker' : 'Pick an element from the page'}
    aria-label={pickerActive ? 'Cancel element picker' : 'Pick an element from the page'}
    onclick={togglePicker}
  >
    &#10010;
  </button>
</div>

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
  .toolbar {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    background: var(--surface-raised);
    border-bottom: 1px solid var(--border-subtle);
    flex-shrink: 0;
  }

  .picker-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    padding: 0;
    border-radius: var(--radius-sm);
    background: var(--surface-overlay);
    color: var(--text-muted);
    border: 1px solid var(--border-default);
    font-size: var(--text-base);
    cursor: pointer;
    transition:
      color var(--dur-fast) var(--ease-out),
      background var(--dur-fast) var(--ease-out),
      border-color var(--dur-fast) var(--ease-out);
  }

  .picker-btn:hover {
    color: var(--text-default);
  }

  .picker-btn:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 1px;
  }

  .picker-btn.active {
    background: color-mix(in oklab, var(--accent) 16%, var(--surface-overlay));
    color: var(--accent-text);
    border-color: color-mix(in oklab, var(--accent) 40%, transparent);
  }

  .tree-container {
    overflow-y: auto;
    flex: 1;
    font-family: var(--font-mono);
    font-size: var(--text-md);
    color: var(--text-default);
    user-select: none;
  }

  .tree-row {
    display: flex;
    align-items: center;
    height: var(--row-h);
    padding-right: var(--space-4);
    cursor: pointer;
    white-space: nowrap;
  }

  .tree-row:hover {
    background: var(--surface-hover);
  }

  .tree-row.selected {
    background: var(--surface-selected);
  }

  .chevron {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 12px;
    height: 12px;
    margin-right: var(--space-2);
    padding: 0;
    border: none;
    background: none;
    color: var(--text-muted);
    font-size: 8px;
    cursor: pointer;
    transition: transform var(--dur-fast) var(--ease-out);
    transform: rotate(0deg);
    flex-shrink: 0;
  }

  .chevron.expanded {
    transform: rotate(90deg);
  }

  .chevron-spacer {
    display: inline-block;
    width: 12px;
    margin-right: var(--space-2);
    flex-shrink: 0;
  }

  /* Names are the scan target: neutral hue, carried by weight + brightness. */
  .component-name {
    color: var(--text-strong);
    font-weight: 600;
  }

  .filename {
    color: var(--text-faint);
    font-size: var(--text-sm);
    margin-left: var(--space-3);
  }

  /* Quiet by default; only earns the accent on hover/focus (one accent, earned). */
  .source-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 14px;
    height: 14px;
    margin-left: var(--space-2);
    padding: 0;
    border: none;
    background: none;
    color: var(--text-faint);
    font-size: var(--text-sm);
    cursor: pointer;
    border-radius: var(--radius-sm);
    opacity: 0;
    flex-shrink: 0;
    transition:
      opacity var(--dur-fast) var(--ease-out),
      color var(--dur-fast) var(--ease-out);
  }

  .tree-row:hover .source-btn,
  .tree-row:focus-within .source-btn,
  .source-btn:focus-visible {
    opacity: 1;
  }

  .source-btn:hover,
  .source-btn:focus-visible {
    color: var(--accent-text);
  }

  /* Render-cost heat. The ms value shown alongside is the non-color cue. */
  .duration {
    margin-left: auto;
    font-size: var(--text-xs);
    padding: 1px var(--space-2);
    border-radius: var(--radius-sm);
    flex-shrink: 0;
    font-variant-numeric: tabular-nums;
  }

  .duration-normal {
    color: var(--text-muted);
  }

  .duration-orange {
    background: var(--heat-warn-bg);
    color: var(--heat-warn-fg);
  }

  .duration-red {
    background: var(--heat-danger-bg);
    color: var(--heat-danger-fg);
  }

  .empty-state {
    color: var(--text-muted);
    padding: var(--space-6);
    text-align: center;
    font-style: italic;
  }
</style>
