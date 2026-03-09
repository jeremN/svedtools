<script lang="ts">
  import { setContext } from 'svelte';
  import ContextChild from './ContextChild.svelte';

  let theme = $state('light');

  setContext('theme', {
    get current() {
      return theme;
    },
    toggle() {
      theme = theme === 'light' ? 'dark' : 'light';
    },
  });
</script>

<div class="provider" class:dark={theme === 'dark'}>
  <p>Theme provider (current: {theme})</p>
  <button onclick={() => (theme = theme === 'light' ? 'dark' : 'light')}>Toggle Theme</button>
  <ContextChild />
</div>

<style>
  .provider {
    padding: 12px;
    border: 2px dashed #ccc;
    border-radius: 8px;
  }
  .dark {
    background: #333;
    color: #eee;
    border-color: #666;
  }
</style>
