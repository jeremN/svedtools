<script lang="ts">
  let todos = $state([
    { id: 1, text: 'Learn Svelte 5', done: false },
    { id: 2, text: 'Build DevTools', done: true },
  ]);
  let newTodo = $state('');
  let nextId = $state(3);

  function addTodo() {
    if (!newTodo.trim()) return;
    todos.push({ id: nextId++, text: newTodo, done: false });
    newTodo = '';
  }

  function removeTodo(id: number) {
    const idx = todos.findIndex((t) => t.id === id);
    if (idx !== -1) todos.splice(idx, 1);
  }
</script>

<div data-testid="todo-demo">
  <div>
    <input data-testid="todo-input" bind:value={newTodo} placeholder="New todo..." />
    <button data-testid="todo-add" onclick={addTodo}>Add</button>
  </div>
  <ul data-testid="todo-list">
    {#each todos as todo (todo.id)}
      <li data-testid="todo-item">
        <input type="checkbox" bind:checked={todo.done} />
        <span>{todo.text}</span>
        <button data-testid="todo-remove" onclick={() => removeTodo(todo.id)}>x</button>
      </li>
    {/each}
  </ul>
  <p data-testid="todo-count">{todos.length} items</p>
</div>
