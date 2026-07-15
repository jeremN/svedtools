<script lang="ts">
  import { onMount } from 'svelte';
  import {
    getGraphNodes,
    getGraphEdges,
    getSelectedNodeId,
    selectGraphNode,
    getComponentFilter,
    setComponentFilter,
  } from '../lib/graph.svelte.js';
  import { getComponentMap } from '../lib/components.svelte.js';
  import { send } from '../lib/connection.svelte.js';
  import type { NodeId, ReactiveGraphNode } from '@svelte-devtools/shared';
  import ValueTree from './ValueTree.svelte';
  import { resetExpansion } from '../lib/expansion.svelte.js';
  import { forceSimulation, forceLink, forceManyBody, forceCenter, forceCollide } from 'd3-force';
  import type { SimulationNodeDatum, SimulationLinkDatum } from 'd3-force';

  // -- Simulation types --

  interface SimNode extends SimulationNodeDatum {
    id: string;
    type: ReactiveGraphNode['type'];
    label: string | null;
    value: ReactiveGraphNode['value'];
    dirty: boolean;
    componentId: NodeId | null;
  }

  interface SimLink extends SimulationLinkDatum<SimNode> {
    from: string;
    to: string;
    active: boolean;
  }

  // -- Reactive state from stores --

  let graphNodes = $derived(getGraphNodes());
  let graphEdges = $derived(getGraphEdges());
  let selectedNodeId = $derived(getSelectedNodeId());
  let componentFilter = $derived(getComponentFilter());
  let componentMap = $derived(getComponentMap());

  // -- Simulation state --

  let simNodes: SimNode[] = $state([]);
  let simLinks: SimLink[] = $state([]);
  let simulation: ReturnType<typeof forceSimulation<SimNode>> | null = null;

  // -- Pan / zoom state --

  let translateX: number = $state(0);
  let translateY: number = $state(0);
  let scale: number = $state(1);
  let isPanning: boolean = $state(false);
  let panStartX: number = $state(0);
  let panStartY: number = $state(0);
  let panStartTranslateX: number = $state(0);
  let panStartTranslateY: number = $state(0);

  // -- Tooltip state --

  let tooltipNode: SimNode | null = $state(null);
  let tooltipX: number = $state(0);
  let tooltipY: number = $state(0);

  // -- SVG dimensions --

  let svgElement: SVGSVGElement | undefined = $state(undefined);
  let svgWidth: number = $state(800);
  let svgHeight: number = $state(600);

  // -- Derived: component list for filter dropdown --

  let componentEntries = $derived(Object.entries(componentMap));

  // -- Derived: selected node for detail panel --

  let selectedNode = $derived(simNodes.find((n) => n.id === selectedNodeId) ?? null);
  $effect(() => {
    void selectedNodeId; // track selection
    resetExpansion();
  });

  // -- Derived: set of node IDs connected to selected node --

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  let _selectedConnectedIds = $derived.by(() => {
    if (!selectedNodeId) return new Set<string>();
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const ids = new Set<string>();
    for (const edge of graphEdges) {
      if (edge.from === selectedNodeId || edge.to === selectedNodeId) {
        ids.add(edge.from);
        ids.add(edge.to);
      }
    }
    return ids;
  });

  // -- D3 force simulation effect --

  $effect(() => {
    const nodes = graphNodes;
    const edges = graphEdges;

    // Fast path for live value-only snapshots: same node/edge structure means
    // we can update the rendered data in place without reheating the force
    // simulation — no layout jitter while the inspected app mutates state.
    const sameStructure =
      simNodes.length > 0 &&
      simNodes.length === nodes.length &&
      simLinks.length === edges.length &&
      (() => {
        const byId = new Map(simNodes.map((n) => [n.id, n]));
        if (!nodes.every((n) => byId.has(n.id))) return false;
        const edgeKeys = new Set(simLinks.map((l) => `${l.from}->${l.to}`));
        return edges.every((e) => edgeKeys.has(`${e.from}->${e.to}`));
      })();

    if (sameStructure) {
      const byId = new Map(simNodes.map((n) => [n.id, n]));
      for (const n of nodes) {
        const sn = byId.get(n.id)!;
        sn.value = n.value;
        sn.dirty = n.dirty;
        sn.label = n.label;
      }
      simNodes = [...simNodes];
      return;
    }

    if (simulation) {
      simulation.stop();
      simulation = null;
    }

    if (nodes.length === 0) {
      simNodes = [];
      simLinks = [];
      return;
    }

    // Preserve existing node positions across rebuilds
    const oldPositions = new Map(simNodes.map((n) => [n.id, { x: n.x, y: n.y }]));

    const newSimNodes: SimNode[] = nodes.map((n) => {
      const old = oldPositions.get(n.id);
      return {
        id: n.id,
        type: n.type,
        label: n.label,
        value: n.value,
        dirty: n.dirty,
        componentId: n.componentId,
        x: old?.x,
        y: old?.y,
      };
    });

    const nodeById = new Map(newSimNodes.map((n) => [n.id, n]));

    const newSimLinks: SimLink[] = edges
      .filter((e) => nodeById.has(e.from) && nodeById.has(e.to))
      .map((e) => ({
        source: nodeById.get(e.from)!,
        target: nodeById.get(e.to)!,
        from: e.from,
        to: e.to,
        active: e.active,
      }));

    // If nodes had existing positions, use a lower alpha to gently adjust
    const hasExisting = oldPositions.size > 0 && newSimNodes.some((n) => n.x !== undefined);

    let tickCount = 0;
    const sim = forceSimulation<SimNode>(newSimNodes)
      .force(
        'link',
        forceLink<SimNode, SimLink>(newSimLinks).id((d) => d.id),
      )
      .force('charge', forceManyBody<SimNode>().strength(-200))
      .force('center', forceCenter<SimNode>(svgWidth / 2, svgHeight / 2))
      .force('collide', forceCollide<SimNode>(30))
      .alpha(hasExisting ? 0.3 : 1)
      .on('tick', () => {
        // Throttle Svelte reactivity updates to every 3rd tick
        tickCount++;
        if (tickCount % 3 === 0 || sim.alpha() < 0.01) {
          simNodes = [...newSimNodes];
          simLinks = [...newSimLinks];
        }
      });

    simulation = sim;

    return () => {
      sim.stop();
    };
  });

  // -- Pan handlers --

  function handleMouseDown(event: MouseEvent): void {
    if (event.button !== 0) return;
    isPanning = true;
    panStartX = event.clientX;
    panStartY = event.clientY;
    panStartTranslateX = translateX;
    panStartTranslateY = translateY;
  }

  function handleMouseMove(event: MouseEvent): void {
    if (!isPanning) return;
    translateX = panStartTranslateX + (event.clientX - panStartX);
    translateY = panStartTranslateY + (event.clientY - panStartY);
  }

  function handleMouseUp(): void {
    isPanning = false;
  }

  // -- Zoom handler --

  function handleWheel(event: WheelEvent): void {
    event.preventDefault();
    const rect = svgElement?.getBoundingClientRect();
    if (!rect) return;

    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;

    const zoomFactor = event.deltaY > 0 ? 0.9 : 1.1;
    const newScale = Math.min(5, Math.max(0.1, scale * zoomFactor));

    // Zoom centered on mouse position
    translateX = mouseX - ((mouseX - translateX) / scale) * newScale;
    translateY = mouseY - ((mouseY - translateY) / scale) * newScale;
    scale = newScale;
  }

  // -- Node interaction --

  function handleNodeClick(id: NodeId, event: MouseEvent): void {
    event.stopPropagation();
    selectGraphNode(id);
  }

  function handleNodeMouseEnter(node: SimNode, event: MouseEvent): void {
    tooltipNode = node;
    tooltipX = event.clientX;
    tooltipY = event.clientY;
  }

  function handleNodeMouseLeave(): void {
    tooltipNode = null;
  }

  // -- Background click deselects --

  function handleSvgClick(): void {
    selectGraphNode(null);
  }

  function handleSvgKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      selectGraphNode(null);
    }
  }

  function handleNodeKeyDown(id: NodeId, event: KeyboardEvent): void {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      event.stopPropagation();
      selectGraphNode(id);
    }
  }

  // -- Toolbar actions --

  function handleFilterChange(event: Event): void {
    const target = event.target as HTMLSelectElement;
    const value = target.value === '' ? null : target.value;
    setComponentFilter(value);
    send({ type: 'graph:subscribe', componentId: value ?? undefined });
  }

  function handleRefresh(): void {
    send({ type: 'graph:request', componentId: componentFilter ?? undefined });
  }

  // -- Format value for tooltip --

  function formatValue(value: ReactiveGraphNode['value']): string {
    if (value === null || value === undefined) return 'null';
    if (typeof value === 'string') return `"${value}"`;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    if (typeof value === 'object' && '__type' in value) {
      if (value.__type === 'object') return (value as { preview: string }).preview;
      if (value.__type === 'array') return `Array(${(value as { length: number }).length})`;
      if (value.__type === 'circular') return '[Circular]';
      if (value.__type === 'truncated') return (value as { reason: string }).reason;
      if (value.__type === 'dom') return `<${(value as { tag: string }).tag}>`;
    }
    return String(value);
  }

  // -- Edge color: flame on the active path, neutral otherwise --

  function edgeColor(link: SimLink): string {
    if (selectedNodeId && (link.from === selectedNodeId || link.to === selectedNodeId)) {
      return 'var(--accent)';
    }
    return 'var(--graph-edge)';
  }

  // -- Node fill: a single neutral. Type is read from the shape, not the colour. --

  function nodeFill(): string {
    return 'var(--graph-node)';
  }

  // -- Get link source/target coordinates --

  function linkX1(link: SimLink): number {
    return (link.source as SimNode).x ?? 0;
  }

  function linkY1(link: SimLink): number {
    return (link.source as SimNode).y ?? 0;
  }

  function linkX2(link: SimLink): number {
    return (link.target as SimNode).x ?? 0;
  }

  function linkY2(link: SimLink): number {
    return (link.target as SimNode).y ?? 0;
  }

  // -- Resize observer --

  $effect(() => {
    if (!svgElement) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        svgWidth = entry.contentRect.width;
        svgHeight = entry.contentRect.height;
      }
    });

    observer.observe(svgElement);

    return () => {
      observer.disconnect();
    };
  });

  // -- Subscribe while this tab is visible --
  // App.svelte mounts/destroys this component per tab switch, so mount/
  // cleanup is exactly the visibility span.
  onMount(() => {
    send({ type: 'graph:subscribe', componentId: componentFilter ?? undefined });
    return () => {
      send({ type: 'graph:unsubscribe' });
    };
  });
</script>

<div class="reactivity-graph">
  <!-- Toolbar -->
  <div class="toolbar">
    <select class="filter-select" value={componentFilter ?? ''} onchange={handleFilterChange}>
      <option value="">All components</option>
      {#each componentEntries as [id, comp] (id)}
        <option value={id}>{comp.name}</option>
      {/each}
    </select>

    <button class="refresh-btn" onclick={handleRefresh}>Refresh</button>

    <span class="node-count">
      {graphNodes.length} nodes, {graphEdges.length} edges
    </span>
  </div>

  <!-- Graph area -->
  {#if graphNodes.length === 0}
    <div class="empty-state">No reactive graph data. Click Refresh to load.</div>
  {:else}
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <svg
      bind:this={svgElement}
      class="graph-svg"
      role="application"
      aria-label="Reactivity dependency graph"
      onmousedown={handleMouseDown}
      onmousemove={handleMouseMove}
      onmouseup={handleMouseUp}
      onmouseleave={handleMouseUp}
      onwheel={handleWheel}
      onclick={handleSvgClick}
      onkeydown={handleSvgKeyDown}
    >
      <defs>
        <marker
          id="arrowhead"
          viewBox="0 0 10 6"
          refX="10"
          refY="3"
          markerWidth="8"
          markerHeight="6"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 3 L 0 6 Z" style="fill: var(--graph-edge)" />
        </marker>
        <marker
          id="arrowhead-selected"
          viewBox="0 0 10 6"
          refX="10"
          refY="3"
          markerWidth="8"
          markerHeight="6"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 3 L 0 6 Z" style="fill: var(--accent)" />
        </marker>
      </defs>

      <g transform="translate({translateX}, {translateY}) scale({scale})">
        <!-- Edges -->
        {#each simLinks as link (`${link.from}->${link.to}`)}
          <line
            x1={linkX1(link)}
            y1={linkY1(link)}
            x2={linkX2(link)}
            y2={linkY2(link)}
            style="stroke: {edgeColor(link)}"
            stroke-width="1.5"
            marker-end={selectedNodeId && (link.from === selectedNodeId || link.to === selectedNodeId)
              ? 'url(#arrowhead-selected)'
              : 'url(#arrowhead)'}
          />
        {/each}

        <!-- Nodes -->
        {#each simNodes as node (node.id)}
          {@const nx = node.x ?? 0}
          {@const ny = node.y ?? 0}
          {@const isSelected = selectedNodeId === node.id}

          <g
            class="graph-node"
            transform="translate({nx}, {ny})"
            onclick={(e) => handleNodeClick(node.id, e)}
            onkeydown={(e) => handleNodeKeyDown(node.id, e)}
            onmouseenter={(e) => handleNodeMouseEnter(node, e)}
            onmouseleave={handleNodeMouseLeave}
            role="button"
            tabindex="-1"
          >
            <!-- Dirty pulsing ring -->
            {#if node.dirty}
              {#if node.type === 'source'}
                <circle r="18" class="dirty-ring" fill="none" style="stroke: var(--accent)" stroke-width="2" />
              {:else if node.type === 'derived'}
                <rect
                  x="-16"
                  y="-16"
                  width="32"
                  height="32"
                  transform="rotate(45)"
                  class="dirty-ring"
                  fill="none"
                  style="stroke: var(--accent)"
                  stroke-width="2"
                />
              {:else}
                <rect
                  x="-16"
                  y="-16"
                  width="32"
                  height="32"
                  class="dirty-ring"
                  fill="none"
                  style="stroke: var(--accent)"
                  stroke-width="2"
                />
              {/if}
            {/if}

            <!-- Node shape -->
            {#if node.type === 'source'}
              <circle
                r="12"
                style="fill: {nodeFill()}; stroke: {isSelected ? 'var(--accent)' : 'none'}"
                stroke-width={isSelected ? 2 : 0}
              />
            {:else if node.type === 'derived'}
              <rect
                width="20"
                height="20"
                x="-10"
                y="-10"
                transform="rotate(45)"
                style="fill: {nodeFill()}; stroke: {isSelected ? 'var(--accent)' : 'none'}"
                stroke-width={isSelected ? 2 : 0}
              />
            {:else}
              <rect
                width="20"
                height="20"
                x="-10"
                y="-10"
                style="fill: {nodeFill()}; stroke: {isSelected ? 'var(--accent)' : 'none'}"
                stroke-width={isSelected ? 2 : 0}
              />
            {/if}

            <!-- Label -->
            <text class="node-label" y="24" text-anchor="middle">
              {node.label ?? node.type}
            </text>
          </g>
        {/each}
      </g>
    </svg>

    <!-- Tooltip -->
    {#if tooltipNode}
      <div class="tooltip" style="left: {tooltipX + 12}px; top: {tooltipY + 12}px">
        <div class="tooltip-label">{tooltipNode.label ?? 'unnamed'}</div>
        <div class="tooltip-type">Type: {tooltipNode.type}</div>
        {#if tooltipNode.value !== null && tooltipNode.value !== undefined}
          <div class="tooltip-value">Value: {formatValue(tooltipNode.value)}</div>
        {/if}
        {#if tooltipNode.dirty}
          <div class="tooltip-dirty">Dirty</div>
        {/if}
      </div>
    {/if}
  {/if}

  {#if selectedNode && selectedNode.value !== null && selectedNode.value !== undefined}
    <div class="detail-panel">
      <div class="detail-header">
        <span class="detail-label">{selectedNode.label ?? selectedNode.type}</span>
        <span class="detail-type">{selectedNode.type}</span>
      </div>
      <div class="detail-value">
        <ValueTree rootId={selectedNode.id} value={selectedNode.value} />
      </div>
    </div>
  {/if}
</div>

<style>
  .reactivity-graph {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    position: relative;
    overflow: hidden;
  }

  /* -- Toolbar -- */

  .toolbar {
    display: flex;
    align-items: center;
    gap: var(--space-4);
    background: var(--surface-raised);
    padding: var(--space-3) var(--space-4);
    border-bottom: 1px solid var(--border-subtle);
    flex-shrink: 0;
  }

  .filter-select {
    background: var(--surface-overlay);
    border: 1px solid var(--border-default);
    color: var(--text-default);
    font-size: var(--text-base);
    font-family: var(--font-ui);
    padding: 3px var(--space-3);
    border-radius: var(--radius-sm);
    outline: none;
  }

  .filter-select:focus {
    border-color: var(--accent);
  }

  .refresh-btn {
    background: var(--surface-overlay);
    border: 1px solid var(--border-default);
    color: var(--text-default);
    font-size: var(--text-base);
    padding: 3px var(--space-5);
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: background var(--dur-fast) var(--ease-out);
  }

  .refresh-btn:hover {
    background: color-mix(in oklab, var(--surface-overlay) 90%, white);
  }

  .node-count {
    margin-left: auto;
    color: var(--text-muted);
    font-size: var(--text-sm);
    font-family: var(--font-mono);
    font-variant-numeric: tabular-nums;
  }

  /* -- SVG graph -- */

  .graph-svg {
    flex: 1;
    width: 100%;
    cursor: grab;
    user-select: none;
  }

  .graph-svg:active {
    cursor: grabbing;
  }

  .graph-node {
    cursor: pointer;
  }

  .node-label {
    fill: var(--text-muted);
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    pointer-events: none;
  }

  /* -- Dirty pulse (flame). Stays a static visible ring under reduced motion. -- */

  .dirty-ring {
    animation: pulse 1s var(--ease-out) infinite;
  }

  @keyframes pulse {
    0%,
    100% {
      stroke-opacity: 1;
    }
    50% {
      stroke-opacity: 0.3;
    }
  }

  /* -- Tooltip -- */

  .tooltip {
    position: fixed;
    background: var(--surface-overlay);
    border: 1px solid var(--border-default);
    padding: var(--space-4);
    border-radius: var(--radius-md);
    pointer-events: none;
    z-index: var(--z-tooltip);
    font-family: var(--font-mono);
    font-size: var(--text-sm);
    color: var(--text-default);
    max-width: 250px;
    white-space: nowrap;
  }

  .tooltip-label {
    font-weight: 600;
    color: var(--text-strong);
    margin-bottom: var(--space-2);
  }

  .tooltip-type {
    color: var(--text-muted);
  }

  .tooltip-value {
    color: var(--val-string);
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .tooltip-dirty {
    color: var(--accent-text);
    font-weight: 600;
    margin-top: var(--space-2);
  }

  /* -- Empty state -- */

  .empty-state {
    display: flex;
    align-items: center;
    justify-content: center;
    flex: 1;
    color: var(--text-muted);
    font-family: var(--font-mono);
    font-size: var(--text-md);
    font-style: italic;
  }

  /* -- Detail panel -- */

  .detail-panel {
    position: absolute;
    right: var(--space-4);
    bottom: var(--space-4);
    max-width: 320px;
    max-height: 50%;
    overflow: auto;
    background: var(--surface-overlay);
    border: 1px solid var(--border-default);
    border-radius: var(--radius-md);
    padding: var(--space-4);
    z-index: var(--z-overlay);
  }
  .detail-header {
    display: flex;
    gap: var(--space-4);
    align-items: baseline;
    margin-bottom: var(--space-3);
  }
  .detail-label {
    font-weight: 600;
    color: var(--text-strong);
    font-family: var(--font-mono);
  }
  .detail-type {
    color: var(--text-muted);
    font-size: var(--text-sm);
    font-family: var(--font-mono);
  }
</style>
