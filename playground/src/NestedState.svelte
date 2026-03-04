<script lang="ts">
  let user = $state({
    name: 'Alice',
    profile: {
      age: 30,
      address: {
        city: 'Portland',
        zip: '97201',
      },
    },
    hobbies: ['hiking', 'coding'],
  });

  function addHobby() {
    user.hobbies.push('hobby-' + (user.hobbies.length + 1));
  }

  function updateCity() {
    user.profile.address.city = user.profile.address.city === 'Portland' ? 'Seattle' : 'Portland';
  }
</script>

<div>
  <p>Name: {user.name}</p>
  <p>City: {user.profile.address.city}</p>
  <p>Hobbies: {user.hobbies.join(', ')}</p>
  <button onclick={updateCity}>Toggle City</button>
  <button onclick={addHobby}>Add Hobby</button>
</div>
