<script>
  let input = $state(1);
  let doubled = $derived(input * 2);
  let quadrupled = $derived(doubled * 2);
</script>

<p>{quadrupled}</p>
