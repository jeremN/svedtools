<script lang="ts">
  import { resolve } from '$app/paths';
</script>

<article class="doc">
  <h1>Extension</h1>
  <p class="lead">
    The Chrome extension provides a DevTools panel for inspecting and editing Svelte 5 components, reactivity graphs,
    performance profiles, and update traces.
  </p>

  <section>
    <h2>Loading the Extension</h2>
    <ol>
      <li>
        Build the extension:
        <pre><code>cd packages/extension && pnpm build</code></pre>
      </li>
      <li>
        Open <code>chrome://extensions</code> in Chrome.
      </li>
      <li>Enable <strong>Developer mode</strong> (top-right toggle).</li>
      <li>
        Click <strong>Load unpacked</strong> and select
        <code>packages/extension/dist</code>.
      </li>
      <li>
        Open any page with an instrumented Svelte app, then open DevTools (<kbd>F12</kbd>). A <strong>Svelte</strong> tab
        will appear.
      </li>
    </ol>
  </section>

  <section>
    <h2>Panel Tabs</h2>
    <p>The DevTools panel has four tabs: Components, Reactivity, Profiler, and Tracer.</p>

    <div class="tab-list">
      <div class="tab-item">
        <h3>Components</h3>
        <p>The live component tree, with a State inspector for the selected component.</p>
        <ul>
          <li>The search bar filters the tree to matching component names (shown as a flat list).</li>
          <li>
            Chevrons expand/collapse a subtree; clicking a row (or pressing <kbd>Enter</kbd>/<kbd>Space</kbd>) selects a
            component and requests its state snapshot.
          </li>
          <li>Hovering a row draws a highlight overlay over that component's DOM on the inspected page.</li>
          <li>
            The crosshair button picks an element from the page: click it, then click any element on the page to select
            its owning component. Escape or clicking the button again cancels. Matching is file-based, so it can't tell
            apart two instances of the same component.
          </li>
          <li>
            Each row shows the file basename and a <strong>&#8599;</strong> button that opens the source file in your editor.
          </li>
          <li>Render duration is colored per row: red above 16&nbsp;ms, orange above 8&nbsp;ms.</li>
        </ul>
      </div>

      <div class="tab-item">
        <h3>Reactivity</h3>
        <p>A live, force-directed graph of the reactive network.</p>
        <ul>
          <li>
            Nodes are typed <strong>source</strong>, <strong>derived</strong>, or <strong>effect</strong>, labeled when
            Svelte emits a name, with a pulsing dirty indicator; edges run from signals to the reactions that read them.
          </li>
          <li>A component filter dropdown scopes the graph to one component; Refresh re-requests it.</li>
          <li>Drag to pan, wheel to zoom.</li>
          <li>
            Selecting a node outlines it and its directly connected edges, and (for nodes with a value) opens a detail
            panel with the current value.
          </li>
          <li>
            While the tab is open, the bridge streams updated snapshots as state changes, throttled to about twice a
            second.
          </li>
        </ul>
      </div>

      <div class="tab-item">
        <h3>Profiler</h3>
        <p>
          Record/Stop, Clear, and an elapsed indicator, with a summary of <code>N mounts, N updates, N effects</code>.
        </p>
        <ul>
          <li>
            <strong>Components</strong> — mount timings only: components that mounted while recording, with count/total/avg/max.
            It doesn't track re-renders.
          </li>
          <li>
            <strong>Updates</strong> — per-component update-cycle timings. This is where re-render cost shows up; a
            component needs no <code>$effect</code> to appear here.
          </li>
          <li><strong>Effects</strong> — user <code>$effect</code> runs, attributed to their owning component.</li>
          <li>
            Components already mounted when you press Record still show up in <strong>Updates</strong> and
            <strong>Effects</strong>, since timing is gated when each effect runs. Only the
            <strong>Components</strong> table requires a mount during the recording.
          </li>
          <li>Rows heat-tint red above 16&nbsp;ms, orange above 8&nbsp;ms.</li>
          <li>
            While recording, mount and effect timings also land in Chrome's Performance panel as custom tracks (grouped
            under "Svelte DevTools Pro") via <code>console.timeStamp</code>. Update timings appear only in the Updates
            table here.
          </li>
        </ul>
      </div>

      <div class="tab-item">
        <h3>Tracer</h3>
        <p>A timeline of state-write events captured while the panel is connected.</p>
        <ul>
          <li>
            Rapid synchronous writes to the same signal coalesce into one trace, marked with a <code>&times;N</code> badge.
          </li>
          <li>
            Each trace shows a root cause (signal, old &rarr; new value, owning component, an expandable stack trace), a
            propagation chain through deriveds and effects (capped at 50 steps), and the DOM mutations observed around
            that update. The mutation list is best-effort: a page-wide observer collects it, so nearby unrelated
            mutations can appear and later async work can be missed.
          </li>
          <li>Selecting a trace opens its detail pane; Clear empties the list.</li>
        </ul>
      </div>
    </div>

    <h3>State inspector</h3>
    <p>
      The right pane of the Components tab shows the selected component's reactive state. Each row is badged
      <code>$state</code> or <code>$derived</code>; the <code>$derived</code> badge comes from a structural check at snapshot
      time, based on what the runtime itself considers a derived. Component props aren't listed: the inspector shows runes-tagged
      signals only. Objects and arrays drill down lazily, fetching one level of children per expansion. While the selected
      component keeps updating, the snapshot live-refreshes (debounced) so the panel tracks the app.
    </p>

    <h3>Editing state</h3>
    <p>
      Double-click any primitive value on a <code>$state</code> row to edit it in place. It's also reachable from the
      keyboard: the value is a focusable button, and pressing <kbd>Enter</kbd> opens the same editor.
      <kbd>Enter</kbd> commits the edit; <kbd>Escape</kbd> or clicking away cancels it.
    </p>
    <ul>
      <li>
        Editable types are strings, numbers, booleans, and <code>null</code>, at the top level or nested at any
        drilled-down path.
      </li>
      <li>
        The input is prefilled with the JSON form of the current value (strings show their quotes). On commit the text
        is parsed as JSON: <code>42</code> becomes a number, <code>true</code> a boolean, <code>"hi"</code> a string.
        Typing unquoted text (e.g. <code>hello</code>) commits as a plain string only when the field already held a
        string; on a number/boolean/<code>null</code> field, non-JSON input is refused rather than silently changing the value's
        type. You can still change a value's type deliberately by typing valid JSON of the new type.
      </li>
      <li>
        Top-level edits go through Svelte's own <code>set()</code>, so equality checks and reaction scheduling are
        Svelte's; nested edits assign directly through the live <code>$state</code> proxy. Either way the app updates through
        real reactivity: deriveds recompute and the DOM updates, the same as an assignment in the code.
      </li>
      <li>
        Edits are refused, and the field visibly reverts, for: <code>$derived</code> rows,
        <code>Map</code>/<code>Set</code> contents, keys that don't exist, out-of-bounds array indices, and strings the inspector
        shows truncated (longer than 200 characters).
      </li>
      <li>
        Panel-initiated edits don't show up in the Tracer: they bypass the compile-time write instrumentation, so
        there's no write event to record.
      </li>
    </ul>
  </section>

  <section>
    <h2>Status Bar & Version Detection</h2>
    <p>The footer status bar moves through three states as the panel connects to an instrumented page:</p>
    <ul>
      <li><strong>Disconnected</strong> (hollow red ring) &mdash; no bridge on this tab.</li>
      <li>
        <strong>Waiting for Svelte&hellip;</strong> (pulsing) &mdash; the bridge is present but hasn't seen the app's Svelte
        runtime yet.
      </li>
      <li>
        <strong>Svelte {'{version}'}</strong> (solid flame dot) &mdash; the version Svelte itself discloses. Svelte 5
        publishes only its <em>major</em> version (<code>PUBLIC_VERSION = '5'</code>), so the status bar reads
        <code>Svelte 5</code> rather than a full semver; that's all the bridge can see.
      </li>
    </ul>
    <p>
      An untested-version banner appears when the detected major version falls outside the range this bridge is verified
      against. See <a href={resolve('/docs/vite-plugin')}>Vite Plugin</a> for the current range.
    </p>
  </section>

  <section>
    <h2>Bridge Communication</h2>
    <p>The extension communicates with the instrumented page through a layered message-passing architecture:</p>
    <ol>
      <li>
        <strong>Page bridge</strong> &mdash; injected by the Vite plugin, collects instrumentation events and posts them
        via <code>window.postMessage</code>.
      </li>
      <li>
        <strong>Content script</strong> &mdash; runs in Chrome's isolated world, relays messages between the page and
        the service worker over a long-lived port opened with
        <code>chrome.runtime.connect</code>.
      </li>
      <li>
        <strong>Service worker</strong> &mdash; background script that routes messages to the correct DevTools panel
        instance via <code>chrome.runtime.connect</code>.
      </li>
      <li>
        <strong>Panel</strong> &mdash; the DevTools UI that receives and renders the data.
      </li>
    </ol>
    <p>
      All messages use a shared wire protocol defined in
      <code>packages/shared</code>, ensuring type safety across the boundary.
    </p>
  </section>
</article>

<style>
  .doc {
    max-width: 42rem;
  }

  h1 {
    font-size: 1.75rem;
    margin-bottom: 0.5rem;
  }

  .lead {
    color: var(--text-muted);
    font-size: 1.05rem;
    margin-bottom: 2rem;
  }

  section {
    margin-bottom: 2rem;
  }

  h2 {
    font-size: 1.25rem;
    margin-bottom: 0.75rem;
  }

  h3 {
    font-size: 1.05rem;
    margin-top: 1.25rem;
    margin-bottom: 0.35rem;
  }

  p {
    margin-bottom: 0.75rem;
  }

  pre {
    background: var(--code-bg);
    color: var(--code-text);
    padding: 0.75rem 1rem;
    border-radius: 8px;
    overflow-x: auto;
    font-size: 0.85rem;
    line-height: 1.5;
    margin-bottom: 0.75rem;
  }

  code {
    font-family: 'SF Mono', 'Fira Code', 'Fira Mono', Menlo, monospace;
    font-size: 0.88em;
  }

  :global(.doc p > code),
  :global(.doc li > code) {
    background: var(--code-inline-bg);
    padding: 0.15em 0.4em;
    border-radius: 3px;
  }

  ol {
    padding-left: 1.5rem;
    margin-bottom: 0.75rem;
  }

  ul {
    padding-left: 1.5rem;
    margin-bottom: 0.75rem;
  }

  li {
    margin-bottom: 0.5rem;
  }

  kbd {
    background: var(--code-inline-bg);
    border: 1px solid var(--border);
    border-radius: 3px;
    padding: 0.1em 0.4em;
    font-size: 0.85em;
    font-family: inherit;
  }

  .tab-list {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    margin-top: 0.5rem;
    margin-bottom: 0.5rem;
  }

  .tab-item {
    padding: 1rem 1.25rem;
    border: 1px solid var(--border);
    border-radius: 8px;
  }

  .tab-item p {
    margin-bottom: 0.5rem;
    font-size: 0.9rem;
    color: var(--text-muted);
  }

  .tab-item ul {
    margin-bottom: 0;
    font-size: 0.87rem;
    color: var(--text-muted);
  }

  .tab-item li {
    margin-bottom: 0.35rem;
  }
</style>
