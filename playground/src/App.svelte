<script lang="ts">
  import Counter from './Counter.svelte';
  import TodoList from './TodoList.svelte';
  import NestedState from './NestedState.svelte';
  import EffectChain from './EffectChain.svelte';
  import ContextPair from './ContextPair.svelte';
</script>

<div class="playground">
  <h1>Svelte DevTools Playground</h1>
  <p>Test components for exercising various reactive patterns.</p>

  <section>
    <h2>Counter</h2>
    <Counter />
  </section>

  <section>
    <h2>Todo List</h2>
    <TodoList />
  </section>

  <section>
    <h2>Nested State</h2>
    <NestedState />
  </section>

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
