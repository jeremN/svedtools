<script>
  let count = $state(0);
  // eslint-disable-next-line svelte/prefer-writable-derived -- intentional: testing $effect instrumentation
  let log = $state('');

  $effect(() => {
    log = `count is ${count}`;
  });
</script>

<button onclick={() => count++}>Inc</button>
<p>{log}</p>
