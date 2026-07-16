<script lang="ts">
  import type { SerializedValue, SerializedObject, SerializedArray, NodeId } from '@svelte-devtools/shared';
  import { isOpen, entry, toggle, scheduleLiveRefresh } from '../lib/expansion.svelte.js';
  import { send } from '../lib/connection.svelte.js';
  import { getSelectedId } from '../lib/components.svelte.js';
  import Self from './ValueTree.svelte';

  let {
    rootId,
    value,
    path = [],
    editable = false,
  }: { rootId: NodeId; value: SerializedValue; path?: string[]; editable?: boolean } = $props();

  let open = $derived(isOpen(rootId, path));
  let loaded = $derived(entry(rootId, path));

  let editing = $state(false);
  let draft = $state('');

  // Editable leaves are the JSON-representable primitives. Strings longer
  // than 200 chars are exactly the serializer's truncation output
  // (MAX_STRING_LEN in vite-plugin/src/bridge/serializer.ts) — committing a
  // truncated string would destroy the tail, so those are read-only.
  function isEditableLeaf(v: SerializedValue): boolean {
    if (!editable) return false;
    if (v === null) return true;
    if (typeof v === 'boolean' || typeof v === 'number') return true;
    if (typeof v === 'string') return v.length <= 200;
    return false;
  }

  function beginEdit(): void {
    draft = JSON.stringify(value);
    editing = true;
  }

  function commitEdit(): void {
    if (!editing) return;
    const trimmed = draft.trim();
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      // Not valid JSON. Only string fields accept the raw text as a
      // convenience (typing hello without quotes); for number/boolean/null
      // fields a failed parse would silently change the value's type (e.g.
      // clearing a number field would commit ''), so refuse the commit and
      // leave the value unchanged — type changes must be explicit valid JSON.
      if (typeof value !== 'string') {
        editing = false;
        return;
      }
      parsed = draft;
    }
    editing = false;
    send({ type: 'state:edit', signalId: rootId, path, value: parsed });
    // Fire-and-forget: the debounced live refresh re-inspects the component
    // and re-fetches open drill-down paths, so the UI converges on the
    // bridge's authoritative value — confirming the edit or reverting it.
    scheduleLiveRefresh(getSelectedId());
  }

  function cancelEdit(): void {
    editing = false;
  }

  function onEditorKeydown(e: KeyboardEvent): void {
    if (e.key === 'Enter') {
      e.preventDefault();
      commitEdit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelEdit();
    }
  }

  function focusOnMount(node: HTMLInputElement): void {
    node.focus();
    node.select();
  }

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
  {#if editing}
    <input
      class="vt-editor"
      type="text"
      bind:value={draft}
      onkeydown={onEditorKeydown}
      onblur={cancelEdit}
      use:focusOnMount
      aria-label="Edit value"
    />
  {:else if isEditableLeaf(value)}
    <button
      class="vt-preview vt-editable {valueClass(value)}"
      title="Double-click to edit"
      ondblclick={beginEdit}
      onkeydown={(e) => {
        if (e.key === 'Enter') beginEdit();
      }}>{preview(value)}</button
    >
  {:else}
    <span class="vt-preview {valueClass(value)}">{preview(value)}</span>
  {/if}

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
            <Self {rootId} value={child} path={[...path, k]} {editable} />
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
  .vt-editable {
    background: none;
    border: none;
    padding: 0;
    font: inherit;
    cursor: text;
  }
  .vt-editor {
    font-family: var(--font-mono);
    font-size: var(--text-base);
    color: var(--text-default);
    background: var(--surface-overlay);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-sm);
    padding: 0 var(--space-3);
    min-width: 60px;
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
