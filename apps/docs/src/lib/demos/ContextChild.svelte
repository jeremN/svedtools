<script lang="ts">
  import { getContext } from 'svelte';

  const theme = getContext<{ current: string; toggle: () => void }>('theme');
</script>

<div data-testid="context-child">
  <p data-testid="context-child-theme">Child sees: {theme.current}</p>
  <button data-testid="context-child-toggle" onclick={theme.toggle}>Toggle from Child</button>
</div>
