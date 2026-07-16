<script lang="ts">
  const pluginOptions = `svelteDevtools({
  enabled: true, // Enable instrumentation (default: true in dev)
})`;

  const pushPopExample = `// Compiled output (simplified): the DevTools call is injected around
// Svelte's own call, as a comma expression.

// $.push($$props, true, Counter)
(window.__svelte_devtools__?.onPush("Counter", $$props, Counter), $.push($$props, true, Counter));
// ...component logic...
// $.pop($$exports)
(window.__svelte_devtools__?.onPop($), $.pop($$exports));`;

  const setUpdateExample = `// Original: count = count + 1
// Instrumented (simplified; the read half of the expression is compiled
// output too, but that read call isn't instrumented):
$.set(count, <current value> + 1);
//  ^-- only the write is tracked by DevTools`;

  const instrumentedHooks = `// Compiler-emitted calls the Vite plugin wraps — nothing else:
$.push(props, runes, ComponentFn)   // Component mount start
$.pop(exports)                       // Component mount end
$.user_effect(fn)                    // $effect registration + profiling wrap
$.template_effect(fn)                // Update-cycle timing (not registered)
$.set(signal, value)                 // State write
$.update(signal)                     // State increment/decrement
$.tag(signal, label)                 // Signal naming
$.tag_proxy(proxy, label)            // Signal naming (object/array/Map $state)`;
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
    <p>This is a compile-time approach, meaning:</p>
    <ul>
      <li>
        Low overhead when idle: instrumented effects check a flag per run, and each instrumented state write passes
        through a pair of small hooks that return immediately when no panel is connected. Timing work only happens while
        the profiler records.
      </li>
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
      Each component function's existing <code>$.push</code> and <code>$.pop</code> calls track the component tree.
      <code>$.pop</code> also hands the bridge the compiled module's own internals namespace, which it uses to register unmount
      tracking and to power state editing:
    </p>
    <pre><code>{pushPopExample}</code></pre>

    <h3>State Mutations</h3>
    <p>
      Assignments to <code>$state</code> variables compile to <code>$.set</code> calls. The plugin ensures these are visible
      to the DevTools:
    </p>
    <pre><code>{setUpdateExample}</code></pre>

    <p>
      Signal <em>naming</em> rides on the compiler emitting <code>$.tag</code>/<code>$.tag_proxy</code>, which early
      Svelte&nbsp;5 (&le;&nbsp;5.20) doesn't emit. The component tree and tracing still work on those versions, but
      signals show up unnamed.
    </p>
  </section>

  <section>
    <h2>Bridge Injection</h2>
    <p>In addition to AST transforms, the plugin injects a small bridge script into the page. This bridge:</p>
    <ul>
      <li>Listens for instrumentation events from the compiled components.</li>
      <li>Serializes component data using the shared wire protocol.</li>
      <li>Posts messages to the content script via <code>window.postMessage</code>.</li>
    </ul>
    <p>
      The bridge always initializes in dev (component tree registration is effectively free), but the per-write tracing
      work of stack capture, value serialization, and trace messaging only runs while a DevTools panel is connected,
      keeping the overhead minimal.
    </p>
  </section>

  <section>
    <h2>Security: dev-server WebSocket</h2>
    <p>
      Jump-to-source and the panel's source viewer reach the Vite dev server over its WebSocket channel &mdash; the
      <code>open-in-editor</code> and <code>get-source</code> handlers the plugin registers. Both are clamped to files
      inside your project root, and <code>get-source</code> further restricts reads to recognized source extensions.
    </p>
    <p>
      That channel is authenticated by Vite itself. Since the fix for
      <a href="https://github.com/advisories/GHSA-vg6x-rcgg-rjx6">CVE-2025-24010</a>, Vite rejects any WebSocket upgrade
      that carries an <code>Origin</code> header without the per-server token it embeds only in the client it serves to
      your dev origin. Browser WebSocket handshakes always send <code>Origin</code>, so a malicious website you visit
      while the dev server is running cannot drive these handlers.
    </p>
    <p>
      Because the plugin relies on that gate, it requires a Vite that ships it: <strong
        >Vite&nbsp;5.4.12 / 6.0.9 or newer</strong
      >
      (7.x and 8.x already include it). This is enforced by the plugin's
      <code>peerDependencies</code>. Do not set <code>legacy.skipWebSocketTokenCheck: true</code> in your Vite config while
      the DevTools plugin is enabled &mdash; it disables exactly the authentication these handlers depend on.
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
    background: var(--code-inline-bg);
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
