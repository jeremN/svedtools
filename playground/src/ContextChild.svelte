<script lang="ts">
  import { getContext } from 'svelte';

  const theme = getContext<{ current: string; toggle: () => void }>('theme');
</script>

<div class="child">
  <p>Child sees theme: {theme.current}</p>
  <button onclick={theme.toggle}>Toggle from child</button>
</div>

<style>
  .child {
    margin-top: 8px;
    padding: 8px;
    border: 1px solid #aaa;
    border-radius: 4px;
  }
</style>
