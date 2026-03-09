<script lang="ts">
  interface Todo {
    id: number;
    text: string;
    done: boolean;
  }

  let todos: Todo[] = $state([
    { id: 1, text: 'Learn Svelte 5', done: true },
    { id: 2, text: 'Build DevTools', done: false },
  ]);
  let nextId = $state(3);
  let newText = $state('');

  let remaining = $derived(todos.filter((t) => !t.done).length);

  function addTodo() {
    if (!newText.trim()) return;
    todos.push({ id: nextId++, text: newText, done: false });
    newText = '';
  }

  function removeTodo(id: number) {
    const idx = todos.findIndex((t) => t.id === id);
    if (idx !== -1) todos.splice(idx, 1);
  }
</script>

<div>
  <form
    onsubmit={(e) => {
      e.preventDefault();
      addTodo();
    }}
  >
    <input bind:value={newText} placeholder="Add todo..." />
    <button type="submit">Add</button>
  </form>
  <ul>
    {#each todos as todo (todo.id)}
      <li>
        <input type="checkbox" bind:checked={todo.done} />
        <span class:done={todo.done}>{todo.text}</span>
        <button onclick={() => removeTodo(todo.id)}>x</button>
      </li>
    {/each}
  </ul>
  <p>{remaining} remaining</p>
</div>

<style>
  .done {
    text-decoration: line-through;
    opacity: 0.5;
  }
</style>
