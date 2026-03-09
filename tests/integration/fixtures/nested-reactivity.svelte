<script>
  let user = $state({ name: 'Alice', address: { city: 'Paris' } });
</script>

<input bind:value={user.name} />
<p>{user.address.city}</p>
