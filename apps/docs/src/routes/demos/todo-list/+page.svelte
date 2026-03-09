<script lang="ts">
	import TodoList from '$lib/demos/TodoList.svelte';
</script>

<h1>Todo List Demo</h1>
<p>
	Demonstrates array mutations with <code>$state</code> and keyed <code>{'{#each}'}</code> blocks.
	Open DevTools to watch how adding, removing, and toggling items triggers fine-grained reactivity
	updates.
</p>

<TodoList />
