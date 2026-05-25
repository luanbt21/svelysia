<script lang="ts">
	import * as Popover from "$lib/components/ui/popover";
	import { getLocale, locales, setLocale } from "$lib/paraglide/runtime";
	import { ChevronDown, Globe } from "@lucide/svelte";

	let open = $state(false);
	const currentLocale = $derived(getLocale());
</script>

<Popover.Root bind:open>
	<Popover.Trigger>
		{#snippet child({ props })}
			<button
				{...props}
				type="button"
				class="inline-flex items-center justify-center gap-1.5 rounded-lg border bg-background/50 backdrop-blur-md px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted/50 transition-colors focus:outline-none"
				aria-expanded={open}
				aria-haspopup="true"
			>
				<Globe class="h-4 w-4 text-muted-foreground" />
				<span class="uppercase">{currentLocale}</span>
				<ChevronDown
					class="h-3 w-3 text-muted-foreground transition-transform duration-200 {open
						? 'rotate-180'
						: ''}"
				/>
			</button>
		{/snippet}
	</Popover.Trigger>

	<Popover.Content class="w-36 p-1 border rounded-lg gap-0 bg-background/95 backdrop-blur-md" align="end">
		<div class="py-0.5 space-y-0.5" role="menu" aria-orientation="vertical">
			{#each locales as locale}
				<button
					type="button"
					class="flex w-full items-center justify-between px-3 py-2 text-xs rounded-md transition-colors {currentLocale === locale
						? 'bg-primary/10 text-primary font-semibold'
						: 'text-foreground hover:bg-muted'} focus:outline-none"
					role="menuitem"
					onclick={() => {
						setLocale(locale);
						open = false;
					}}
				>
					<span>{locale === "en" ? "English" : "Tiếng Việt"}</span>
					{#if currentLocale === locale}
						<span class="h-1.5 w-1.5 rounded-full bg-primary"></span>
					{/if}
				</button>
			{/each}
		</div>
	</Popover.Content>
</Popover.Root>

