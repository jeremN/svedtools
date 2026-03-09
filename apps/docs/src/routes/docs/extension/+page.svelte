<article class="doc">
  <h1>Extension</h1>
  <p class="lead">
    The Chrome extension provides a DevTools panel for inspecting Svelte 5 components, reactivity graphs, performance
    profiles, and update traces.
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
    <p>The DevTools panel has four tabs:</p>

    <div class="tab-list">
      <div class="tab-item">
        <h3>Components</h3>
        <p>
          Displays the live component tree. Select a component to inspect its props, state, and context. The tree
          updates in real time as components mount and unmount.
        </p>
      </div>

      <div class="tab-item">
        <h3>Reactivity</h3>
        <p>
          Shows reactive dependencies between signals. Visualizes which state variables a component reads and how
          derived values propagate through the dependency graph.
        </p>
      </div>

      <div class="tab-item">
        <h3>Profiler</h3>
        <p>
          Records render timing for each component. Start a profile session, interact with your app, and analyze which
          components re-rendered and how long each render took.
        </p>
      </div>

      <div class="tab-item">
        <h3>Tracer</h3>
        <p>
          Captures a timeline of state updates. Each trace shows the signal that changed, the old and new values, and
          the components that re-rendered as a result.
        </p>
      </div>
    </div>
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
        <strong>Content script</strong> &mdash; runs in the page context, relays messages between the page and the
        service worker using <code>chrome.runtime.sendMessage</code>.
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
    background: #eee;
    padding: 0.15em 0.4em;
    border-radius: 3px;
  }

  ol {
    padding-left: 1.5rem;
    margin-bottom: 0.75rem;
  }

  li {
    margin-bottom: 0.5rem;
  }

  kbd {
    background: #eee;
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
  }

  .tab-item {
    padding: 1rem 1.25rem;
    border: 1px solid var(--border);
    border-radius: 8px;
  }

  .tab-item p {
    margin-bottom: 0;
    font-size: 0.9rem;
    color: var(--text-muted);
  }
</style>
