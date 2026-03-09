<script lang="ts">
  const pluginOptions = `svelteDevtools({
  enabled: true, // Enable instrumentation (default: true in dev)
})`;

  const pushPopExample = `// Compiled output (simplified)
function Counter($$anchor) {
  $.push($$anchor, "Counter", "Counter.svelte");  // <-- injected

  let count = $.source(0);
  // ... component logic ...

  $.pop();  // <-- injected
}`;

  const setUpdateExample = `// Original: count = count + 1
// Instrumented:
$.set(count, $.get(count) + 1);
//  ^-- $.set calls are tracked by DevTools`;

  const instrumentedHooks = `// Hooks injected by the Vite plugin:
$.push(anchor, name, file)   // Component mount start
$.pop()                       // Component mount end
$.set(signal, value)          // State write
$.update(signal)              // State increment/decrement
$.get(signal)                 // State read (dependency tracking)`;
</script>

<article class="doc">
  <h1>Vite Plugin</h1>
  <p class="lead">
    The Vite plugin instruments Svelte's compiled output at build time, injecting hooks that the DevTools extension
    reads at runtime.
  </p>

  <section>
    <h2>Plugin Options</h2>
    <pre><code>{pluginOptions}</code></pre>
    <table>
      <thead>
        <tr>
          <th>Option</th>
          <th>Type</th>
          <th>Default</th>
          <th>Description</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td><code>enabled</code></td>
          <td><code>boolean</code></td>
          <td><code>true</code> (dev)</td>
          <td>Enable or disable instrumentation. Automatically disabled in production builds.</td>
        </tr>
      </tbody>
    </table>
  </section>

  <section>
    <h2>How It Works</h2>
    <p>
      The plugin operates as a Vite transform. After the Svelte compiler produces JavaScript output, the plugin parses
      the AST and injects DevTools hooks around key operations.
    </p>
    <p>This is a <strong>compile-time</strong> approach, meaning:</p>
    <ul>
      <li>Zero runtime overhead when DevTools is not connected.</li>
      <li>No monkey-patching or runtime proxies needed.</li>
      <li>Precise source mapping back to original <code>.svelte</code> files.</li>
    </ul>
  </section>

  <section>
    <h2>Instrumentation Patterns</h2>
    <p>The plugin recognizes and instruments the following Svelte 5 internal calls:</p>
    <pre><code>{instrumentedHooks}</code></pre>

    <h3>Component Boundaries</h3>
    <p>
      Each component function is wrapped with <code>$.push</code> and <code>$.pop</code> calls that track the component tree:
    </p>
    <pre><code>{pushPopExample}</code></pre>

    <h3>State Mutations</h3>
    <p>
      Assignments to <code>$state</code> variables compile to <code>$.set</code> calls. The plugin ensures these are visible
      to the DevTools:
    </p>
    <pre><code>{setUpdateExample}</code></pre>
  </section>

  <section>
    <h2>Bridge Injection</h2>
    <p>In addition to AST transforms, the plugin injects a small bridge script into the page. This bridge:</p>
    <ul>
      <li>Listens for instrumentation events from the compiled components.</li>
      <li>Serializes component data using the shared wire protocol.</li>
      <li>Posts messages to the content script via <code>window.postMessage</code>.</li>
    </ul>
    <p>The bridge is only active when the DevTools panel is open, keeping the overhead minimal.</p>
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
    margin-bottom: 0.5rem;
  }

  p {
    margin-bottom: 0.75rem;
  }

  pre {
    background: var(--code-bg);
    color: var(--code-text);
    padding: 1rem;
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
  :global(.doc li > code),
  :global(.doc td > code) {
    background: #eee;
    padding: 0.15em 0.4em;
    border-radius: 3px;
  }

  ul {
    padding-left: 1.5rem;
    margin-bottom: 0.75rem;
  }

  li {
    margin-bottom: 0.4rem;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 1rem;
    font-size: 0.9rem;
  }

  th,
  td {
    text-align: left;
    padding: 0.5rem 0.75rem;
    border-bottom: 1px solid var(--border);
  }

  th {
    font-weight: 600;
    color: var(--text-muted);
    font-size: 0.8rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
</style>
