<script lang="ts">
  import type { SerializedValue, SerializedObject, SerializedArray, NodeId } from '@svelte-devtools/shared';
  import { isOpen, entry, toggle } from '../lib/expansion.svelte.js';
  import Self from './ValueTree.svelte';

  let { rootId, value, path = [] }: { rootId: NodeId; value: SerializedValue; path?: string[] } = $props();

  let open = $derived(isOpen(rootId, path));
  let loaded = $derived(entry(rootId, path));

  function isComplex(v: SerializedValue): v is Exclude<SerializedValue, string | number | boolean | null | undefined> {
    return typeof v === 'object' && v !== null && '__type' in v;
  }
  function expandable(v: SerializedValue): boolean {
    if (!isComplex(v)) return false;
    if (v.__type === 'object') return (v.childCount ?? 0) > 0;
    if (v.__type === 'array') return v.length > 0;
    return false;
  }
  function preview(v: SerializedValue): string {
    if (v === null) return 'null';
    if (v === undefined) return 'undefined';
    if (typeof v === 'string') return `"${v}"`;
    if (typeof v === 'number' || typeof v === 'boolean') return String(v);
    if (v.__type === 'object') return (v as SerializedObject).preview;
    if (v.__type === 'array') return `Array(${(v as SerializedArray).length})`;
    if (v.__type === 'dom') {
      let s = `<${v.tag}`;
      if (v.id) s += `#${v.id}`;
      if (v.className) s += `.${v.className.split(' ').join('.')}`;
      return `${s}>`;
    }
    if (v.__type === 'circular') return '[Circular]';
    if (v.__type === 'truncated') return v.reason;
    return '';
  }
  function valueClass(v: SerializedValue): string {
    if (v === null || v === undefined) return 'vt-null';
    if (typeof v === 'string') return 'vt-string';
    if (typeof v === 'number') return 'vt-number';
    if (typeof v === 'boolean') return 'vt-boolean';
    if (v.__type === 'dom') return 'vt-dom';
    if (v.__type === 'circular') return 'vt-circular';
    if (v.__type === 'truncated') return 'vt-truncated';
    return 'vt-object'; // object/array
  }
</script>

<span class="vt">
  {#if expandable(value)}
    <button class="vt-toggle" onclick={() => toggle(rootId, path)} aria-expanded={open}>
      {open ? '▼' : '▶'}
    </button>
  {:else}
    <span class="vt-spacer"></span>
  {/if}
  <span class="vt-preview {valueClass(value)}">{preview(value)}</span>

  {#if open}
    <div class="vt-children">
      {#if !loaded || loaded.status === 'loading'}
        <span class="vt-meta">loading…</span>
      {:else if loaded.status === 'error'}
        <span class="vt-meta vt-error">unavailable</span>
      {:else}
        {#each Object.entries(loaded.children ?? {}) as [k, child] (k)}
          <div class="vt-child">
            <span class="vt-key">{k}:</span>
            <Self {rootId} value={child} path={[...path, k]} />
          </div>
        {/each}
      {/if}
    </div>
  {/if}
</span>

<style>
  .vt {
    font-family: var(--font-mono);
    font-size: var(--text-base);
  }
  .vt-toggle {
    background: none;
    border: none;
    color: var(--text-muted);
    cursor: pointer;
    font-size: 9px;
    padding: 0 2px;
    width: 14px;
  }
  .vt-spacer {
    display: inline-block;
    width: 14px;
  }
  .vt-preview {
    color: var(--text-default);
  }
  .vt-string {
    color: var(--val-string);
  }
  .vt-number {
    color: var(--val-number);
  }
  .vt-boolean {
    color: var(--val-boolean);
  }
  .vt-null {
    color: var(--val-null);
    font-style: italic;
  }
  .vt-dom {
    color: var(--val-dom);
  }
  .vt-circular {
    color: var(--val-special);
  }
  .vt-truncated {
    color: var(--text-faint);
    font-style: italic;
  }
  .vt-object {
    color: var(--text-default);
  }
  /* 1px neutral indentation guide (a tree rail, not a decorative side-stripe). */
  .vt-children {
    margin-left: 14px;
    border-left: 1px solid var(--border-subtle);
    padding-left: var(--space-3);
  }
  .vt-child {
    display: flex;
    gap: var(--space-3);
    align-items: baseline;
  }
  .vt-key {
    color: var(--val-key);
    flex-shrink: 0;
  }
  .vt-meta {
    color: var(--text-muted);
    font-style: italic;
  }
  .vt-error {
    color: var(--status-danger);
  }
</style>
