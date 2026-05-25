<script lang="ts">
  import { page } from "$app/state";
  import { Button } from "$lib/components/ui/button";

  let { data, children } = $props();

  const activeTab = $derived.by(() => {
    const path = page.url.pathname;
    if (path.endsWith("/collaborators")) return "members";
    if (path.endsWith("/custom-fields")) return "fields";
    return "tree";
  });
</script>

<div
  class="h-[calc(100vh-66px)] flex flex-col min-h-0 relative overflow-hidden"
>
  <!-- Workspaces sub-navigation bar -->
  <div
    class="bg-background border-b px-4 py-2 flex items-center justify-between z-10 shrink-0"
  >
    <div class="flex items-center gap-4">
      <a
        href="/trees"
        class="text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        Dashboard
      </a>
      <span class="text-muted-foreground text-sm">/</span>
      <h2 class="font-serif text-lg font-bold tracking-tight line-clamp-1">
        {data.tree.name}
      </h2>
    </div>

    <div class="flex items-center gap-1.5 bg-muted p-1 rounded-lg">
      <a href="/trees/{data.tree.id}">
        <Button
          variant={activeTab === "tree" ? "default" : "ghost"}
          size="sm"
          class="h-7 text-xs px-3"
        >
          Visual Tree
        </Button>
      </a>
      <a href="/trees/{data.tree.id}/collaborators">
        <Button
          variant={activeTab === "members" ? "default" : "ghost"}
          size="sm"
          class="h-7 text-xs px-3"
        >
          Collaborators
        </Button>
      </a>
      <a href="/trees/{data.tree.id}/custom-fields">
        <Button
          variant={activeTab === "fields" ? "default" : "ghost"}
          size="sm"
          class="h-7 text-xs px-3"
        >
          Custom Fields
        </Button>
      </a>
    </div>
  </div>

  {@render children()}
</div>
