<script lang="ts">
    import Button from "$lib/components/ui/button/button.svelte";

    let count = $state(0);
</script>

<h1 class="p-4 text-3xl font-bold">Welcome to SvelteKit</h1>
<div class="i-t-trash"></div>

<p class="text-lg">
    Visit <a
        href="https://svelte.dev/docs/kit"
        class="text-blue-500 hover:underline">svelte.dev/docs/kit</a
    > to read the documentation
</p>

<Button onclick={() => count++}>{count}</Button>
