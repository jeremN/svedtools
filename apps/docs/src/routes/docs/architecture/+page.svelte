<script lang="ts">
  import { resolve } from '$app/paths';

  const diagram = `
  +------------------+      +------------------+      +------------------+
  |   Vite Plugin    |      |   Page Bridge    |      |  Content Script  |
  |                  |      |                  |      |                  |
  | AST transforms   |----->| Collects events  |<---->| Relays messages  |
  | at compile time  |      | window.postMsg   |      | chrome.runtime   |
  +------------------+      +------------------+      +------------------+
                                                               ^
                                                               |
                                                               v
                            +------------------+      +------------------+
                            |   DevTools Panel |<---->|  Service Worker  |
                            |                  |      |                  |
                            | Svelte UI:       |      | Routes messages  |
                            | Components, etc. |      | to correct panel |
                            +------------------+      +------------------+`;

  const wsDiagram = `// Jump-to-source: only the last leg leaves the extension wire.
// DevTools Panel -> extension wire -> Page Bridge -> Vite dev-server WebSocket -> launch-editor`;

  const messageTypes = `// packages/shared/src/protocol.ts (abridged)
// Bridge -> panel
'component:mounted' | 'component:unmounted' | 'component:updated'
| 'component:tree' | 'state:snapshot' | 'state:expanded'
| 'graph:snapshot' | 'graph:update' | 'profiler:data'
| 'trace:update' | 'bridge:ready'

// Panel -> bridge
'inspect:component' | 'state:edit' | 'state:expand'
| 'profiler:start' | 'profiler:stop' | 'graph:request'
| 'graph:subscribe' | 'graph:unsubscribe' | 'highlight:component'
| 'open-in-editor' | 'tree:request'

// Service worker -> bridge (lifecycle gates)
| 'devtools:panel-connected' | 'devtools:panel-disconnected'`;
</script>

<article class="doc">
  <h1>Architecture</h1>
  <p class="lead">
    How compile-time instrumentation flows from the Vite plugin through the Chrome extension to the DevTools panel.
  </p>

  <section>
    <h2>System Overview</h2>
    <pre class="diagram"><code>{diagram}</code></pre>
  </section>

  <section>
    <h2>Data Flow</h2>
    <p>
      Data flows in both directions between the instrumented application and the DevTools panel. The bridge reports
      component and state changes; the panel sends back inspection and editing requests. A typical bridge-to-panel trip
      looks like:
    </p>
    <ol>
      <li>
        <strong>Compile time</strong> &mdash; The Vite plugin wraps calls the Svelte compiler already emits in the
        component's compiled output (<code>$.push</code>, <code>$.set</code>, and others), so each wrapped call also
        reports to the bridge.
      </li>
      <li>
        <strong>Page bridge</strong> &mdash; A script injected into the page collects these reports. It serializes
        component data (state, file locations) using the shared wire protocol and posts it via
        <code>window.postMessage</code>.
      </li>
      <li>
        <strong>Content script</strong> &mdash; A Chrome extension content script, running in Chrome's isolated world,
        picks up these messages and relays them to the service worker over a long-lived port opened with
        <code>chrome.runtime.connect</code> (name <code>svelte-devtools-content</code>). The isolated world can't touch
        <code>window.__svelte_devtools__</code> directly; it only exchanges <code>postMessage</code>s with the page.
      </li>
      <li>
        <strong>Service worker</strong> &mdash; The background service worker maintains connections to all open DevTools
        panel instances. It routes incoming messages to the correct panel based on the tab ID, and sends
        <code>devtools:panel-connected</code>/<code>devtools:panel-disconnected</code> lifecycle messages to the bridge so
        mutation tracing can stay idle while no panel is open.
      </li>
      <li>
        <strong>DevTools panel</strong> &mdash; The Svelte-powered panel UI receives the messages, updates its internal state,
        and renders the component tree, reactivity graph, profiler, and update tracer.
      </li>
      <li>
        <strong>Panel to bridge</strong> &mdash; Actions in the panel travel the same path in reverse: selecting a component,
        editing a state value, starting or stopping the profiler, and subscribing to the reactivity graph each send a message
        from panel to service worker to content script to page bridge.
      </li>
    </ol>
    <p>
      Jump-to-source adds a third transport for its last leg: the panel's <code>open-in-editor</code> request travels
      the usual extension wire to the page bridge, which forwards the file, line, and column over Vite's own dev-server
      WebSocket. The dev server then calls the <code>launch-editor</code> package directly.
    </p>
    <pre><code>{wsDiagram}</code></pre>
  </section>

  <section>
    <h2>Key Concepts</h2>

    <h3>Compile-Time Instrumentation</h3>
    <p>
      Unlike runtime-based DevTools that monkey-patch framework internals, this approach is a post-compile AST pass over
      the compiled output: it wraps calls the Svelte compiler already emits (<code>$.push</code>,
      <code>$.pop</code>, <code>$.user_effect</code>, <code>$.template_effect</code>, <code>$.set</code>,
      <code>$.update</code>, <code>$.tag</code>, <code>$.tag_proxy</code>) rather than injecting new runtime calls of
      its own. See <a href={resolve('/docs/vite-plugin')}>Vite Plugin</a> for what each hook reports. This means:
    </p>
    <ul>
      <li>
        Mutation tracing stays idle until a DevTools panel connects; with no panel open, writes skip stack capture,
        serialization, and messaging.
      </li>
      <li>
        Every component carries the path of its original <code>.svelte</code> file, which powers jump-to-source (the editor
        opens the file; line-level positions aren't propagated).
      </li>
      <li>
        Built around Svelte 5's runes and signals as the compiler emits them; what gets instrumented can vary with the
        Svelte version (see Version compatibility below).
      </li>
    </ul>

    <h3>Wire Protocol</h3>
    <p>
      All messages between the page and the extension use a typed protocol defined in
      <code>packages/shared</code>. This ensures type safety across the Chrome extension boundary (page, content script,
      service worker, panel).
    </p>
    <pre><code>{messageTypes}</code></pre>

    <h3>Serialization</h3>
    <p>
      Component state can contain complex objects, circular references, and non-serializable values (functions,
      symbols). Wire payloads are serialized by a small serializer inlined into the page bridge (<code
        >packages/vite-plugin/src/bridge/serializer.ts</code
      >); <code>packages/shared</code> carries the protocol types and a panel-side mirror. The bridge serializer handles this
      by:
    </p>
    <ul>
      <li>
        Truncating nested objects at a fixed depth limit; deeper levels arrive on demand as the panel drills down (<code
          >state:expand</code
        >).
      </li>
      <li>Replacing functions and symbols with descriptive placeholder strings.</li>
      <li>Detecting and breaking circular references.</li>
      <li>Keeping payloads small for fast message passing.</li>
      <li>Never throwing, even when a value's getters or Proxy traps misbehave mid-serialization.</li>
    </ul>

    <h3>Version compatibility</h3>
    <p>
      All runtime access to Svelte's internals goes through a single <code>Compat</code> layer (<code
        >packages/vite-plugin/src/bridge/compat.ts</code
      >), which tracks the Svelte major range the bridge is tested against. The compile-time transform has a separate
      compatibility surface: it assumes the shapes of the calls the Svelte compiler emits, which <code>Compat</code>
      doesn't mediate. When the detected major falls outside the tested range, the bridge marks its
      <code>bridge:ready</code> message <code>untested</code> and the panel shows a warning banner. See
      <a href={resolve('/docs/troubleshooting')}>Troubleshooting</a> for what that means in practice.
    </p>
  </section>

  <section>
    <h2>Project Structure</h2>
    <pre><code
        >svedtools/
  packages/
    vite-plugin/    # Vite plugin (AST transforms + bridge injection)
    extension/      # Chrome extension (content script, service worker, panel)
    shared/         # Wire protocol types and serialization utilities
  apps/
    docs/           # This documentation site (SvelteKit + static adapter)
  playground/       # Demo app the dev server runs for manual testing
  tests/            # Integration and end-to-end tests</code
      ></pre>
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

  pre.diagram {
    font-size: 0.75rem;
    line-height: 1.4;
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

  ol,
  ul {
    padding-left: 1.5rem;
    margin-bottom: 0.75rem;
  }

  li {
    margin-bottom: 0.5rem;
  }
</style>
