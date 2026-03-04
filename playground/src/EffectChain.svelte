<script lang="ts">
  let input = $state(1);
  let effectLog: string[] = $state([]);
  let processed = $state(0);
  let formatted = $derived(`Processed: ${processed}`);

  $effect(() => {
    // This effect reacts to input changes and writes to processed
    processed = input * 10;
    effectLog.push(`Effect 1: input=${input} → processed=${processed}`);
  });

  $effect(() => {
    // This effect reacts to formatted (derived from processed)
    effectLog.push(`Effect 2: formatted="${formatted}"`);
  });

  function increment() {
    input++;
  }

  function clearLog() {
    effectLog.length = 0;
  }
</script>

<div>
  <p>Input: {input}</p>
  <p>{formatted}</p>
  <button onclick={increment}>Increment Input</button>
  <button onclick={clearLog}>Clear Log</button>
  <h4>Effect Log:</h4>
  <ul>
    {#each effectLog as entry, i (i)}
      <li><code>{entry}</code></li>
    {/each}
  </ul>
</div>
