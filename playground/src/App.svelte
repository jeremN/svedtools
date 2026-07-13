<script lang="ts">
  import Counter from './Counter.svelte';
  import TodoList from './TodoList.svelte';
  import NestedState from './NestedState.svelte';
  import EffectChain from './EffectChain.svelte';
  import ContextPair from './ContextPair.svelte';

  // e2e fixture for component-unmount tracking (plan 002): toggling this
  // mounts/unmounts a second, independent Counter instance so a spec can
  // assert the bridge's tree/registries drop the node on unmount instead of
  // accumulating stale duplicates.
  let showToggleCounter = $state(true);
</script>

<div class="playground">
  <h1>Svelte DevTools Playground</h1>
  <p>Test components for exercising various reactive patterns.</p>

  <section>
    <h2>Counter</h2>
    <Counter />
  </section>

  <section>
    <h2>Toggle Counter</h2>
    <button id="toggle-counter" onclick={() => (showToggleCounter = !showToggleCounter)}>
      {showToggleCounter ? 'Unmount' : 'Mount'}
    </button>
    {#if showToggleCounter}
      <Counter />
    {/if}
  </section>

  <section>
    <h2>Todo List</h2>
    <TodoList />
  </section>

  <NestedState />

  <section>
    <h2>Effect Chain</h2>
    <EffectChain />
  </section>

  <section>
    <h2>Context Pair</h2>
    <ContextPair />
  </section>
</div>

<style>
  .playground {
    max-width: 800px;
    margin: 0 auto;
    padding: 20px;
    font-family: system-ui, sans-serif;
  }
  section {
    margin: 24px 0;
    padding: 16px;
    border: 1px solid #ddd;
    border-radius: 8px;
  }
  h2 {
    margin-top: 0;
    color: #ff3e00;
  }
</style>
