<script lang="ts">
  import { browser } from "$app/environment";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Command from "$lib/components/ui/command/index.js";
  import * as Drawer from "$lib/components/ui/drawer/index.js";
  import * as Popover from "$lib/components/ui/popover/index.js";
  import { cn } from "$lib/utils.js";
  import { onMount } from "svelte";

  interface Option {
    value: string;
    label: string;
  }

  let {
    value = $bindable(""),
    options = [] as Option[],
    placeholder = "Select option...",
    searchPlaceholder = "Search options...",
    emptyText = "No option found.",
    disabled = false,
    id,
  } = $props();

  let open = $state(false);
  let isDesktop = $state(false);

  function checkScreenSize() {
    isDesktop = window.innerWidth >= 768;
  }

  onMount(() => {
    if (browser) {
      checkScreenSize();
      window.addEventListener("resize", checkScreenSize);
      return () => window.removeEventListener("resize", checkScreenSize);
    }
  });

  const selectedLabel = $derived(
    options.find((opt) => String(opt.value) === String(value))?.label ||
      placeholder,
  );

  function handleSelect(val: string) {
    value = val;
    open = false;
  }
</script>

{#snippet trigger({ props }: { props: any })}
  <Button
    {...props}
    {id}
    variant="outline"
    class={cn("w-full justify-start text-left font-normal", props.class)}
    {disabled}
  >
    <span class="truncate">{selectedLabel}</span>
  </Button>
{/snippet}

{#snippet content()}
  <Command.Root>
    <Command.Input placeholder={searchPlaceholder} />
    <Command.List>
      <Command.Empty>{emptyText}</Command.Empty>
      <Command.Group>
        {#each options as opt (opt.value)}
          <Command.Item
            value={opt.value}
            keywords={[opt.label]}
            onSelect={() => handleSelect(opt.value)}
          >
            {opt.label}
          </Command.Item>
        {/each}
      </Command.Group>
    </Command.List>
  </Command.Root>
{/snippet}

{#if isDesktop}
  <Popover.Root bind:open>
    <Popover.Trigger class="w-full">
      {#snippet child({ props })}
        {@render trigger({ props })}
      {/snippet}
    </Popover.Trigger>
    <Popover.Content
      class="w-(--bits-popover-anchor-width) min-w-(--bits-popover-anchor-width) p-0"
      align="start"
    >
      {@render content()}
    </Popover.Content>
  </Popover.Root>
{:else}
  <Drawer.Root bind:open>
    <Drawer.Trigger class="w-full">
      {#snippet child({ props })}
        {@render trigger({ props })}
      {/snippet}
    </Drawer.Trigger>
    <Drawer.Content>
      <div class="mt-4 border-t">
        {@render content()}
      </div>
    </Drawer.Content>
  </Drawer.Root>
{/if}
