<script lang="ts">
  import { resolve } from '$app/paths';
</script>

<article class="doc">
  <h1>Troubleshooting</h1>
  <p class="lead">Common problems when getting the panel running, and what causes them.</p>

  <section>
    <h2>The panel is stuck on &ldquo;Waiting for Svelte&hellip;&rdquo;</h2>
    <p>Three things to check, in order:</p>
    <ol>
      <li>
        The page must be served by a dev server with the plugin registered after <code>svelte()</code>. The Vite plugin
        only activates on <code>apply: 'serve'</code>; production and static builds never inject the runtime bridge, so
        the panel has nothing to talk to.
      </li>
      <li>
        Rebuild the extension if <code>packages/extension/dist/</code> is stale or missing: <code>pnpm build</code>.
      </li>
      <li>Reload the inspected page with DevTools open for a clean reconnect.</li>
    </ol>
  </section>

  <section>
    <h2>The untested-version banner shows up</h2>
    <p>
      The detected Svelte major version falls outside the range this bridge is verified against (see
      <a href={resolve('/docs/vite-plugin')}>Vite Plugin</a> for the current range). DevTools features may misbehave on an
      untested major, though the component tree and most panel features typically still work.
    </p>
  </section>

  <section>
    <h2>The version shows just &ldquo;5&rdquo;</h2>
    <p>
      By design. The bridge reads the version Svelte discloses to the page, and Svelte&nbsp;5 publishes only its major
      version (<code>PUBLIC_VERSION = '5'</code> in <code>svelte/src/version.js</code>). The full semver is never
      available to the bridge, so <code>Svelte 5</code> is the expected display, not a detection failure.
    </p>
  </section>

  <section>
    <h2>Signals show as &ldquo;unnamed&rdquo;</h2>
    <p>
      Signal naming relies on the compiler emitting Svelte's <code>$.tag</code> dev helper, which early Svelte 5 (&le;&nbsp;5.20)
      doesn't emit. On those versions the component tree, state inspection, and tracing all still work; only the source-code
      names are unavailable, so rows fall back to &ldquo;unnamed&rdquo;.
    </p>
  </section>

  <section>
    <h2><code>launch-extension-demo.mjs</code> opens a browser without the extension, or nothing happens</h2>
    <p>
      Branded Chrome &ge;&nbsp;137 silently ignores <code>--load-extension</code>, so the script launches Playwright's
      Chrome for Testing (<code>channel: 'chromium'</code>) instead of your everyday Chrome. Make sure
      <code>pnpm build</code> has run so <code>packages/extension/dist</code> exists, and that Playwright's browsers are installed
      if the launch fails outright.
    </p>
  </section>

  <section>
    <h2>An edit appears to do nothing, or reverts</h2>
    <p>The target is read-only by rule, or the input wasn't valid JSON for its field type:</p>
    <ul>
      <li><code>$derived</code> rows are never editable.</li>
      <li><code>Map</code> and <code>Set</code> contents are never editable.</li>
      <li>Keys that don't exist and out-of-bounds array indices are refused.</li>
      <li>Strings the inspector shows truncated (longer than 200 characters) are refused.</li>
      <li>
        On a number, boolean, or <code>null</code> field, text that isn't valid JSON is refused rather than silently changing
        the value's type. Retype it as valid JSON of the intended type.
      </li>
    </ul>
    <p>See <a href={resolve('/docs/extension')}>Extension</a> for the full editing model.</p>
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
    font-size: 1.15rem;
    margin-bottom: 0.75rem;
  }

  p {
    margin-bottom: 0.75rem;
  }

  code {
    font-family: 'SF Mono', 'Fira Code', 'Fira Mono', Menlo, monospace;
    font-size: 0.88em;
  }

  :global(.doc p > code),
  :global(.doc li > code),
  :global(.doc h2 > code) {
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
    margin-bottom: 0.4rem;
  }
</style>
