<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import { Card } from "$lib/components/ui/card";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  import { Plus, Trash2, Calendar, Users, Eye, Edit3, ShieldAlert } from "@lucide/svelte";
  import { toast } from "svelte-sonner";
  import { invalidateAll } from "$app/navigation";
  import { client } from "$lib";

  let { data } = $props();

  let showCreateModal = $state(false);
  let isSubmitting = $state(false);
  let newTreeName = $state("");
  let newTreeDesc = $state("");

  async function handleCreateTree(e: SubmitEvent) {
    e.preventDefault();
    if (!newTreeName.trim()) {
      toast.error("Tree name is required");
      return;
    }
    
    isSubmitting = true;
    try {
      const { data: resData, error } = await client.api.trees.post({
        name: newTreeName,
        description: newTreeDesc || undefined
      });

      if (error) {
        throw new Error(error.value as string || "Failed to create family tree");
      }

      toast.success("Family tree created successfully!");
      showCreateModal = false;
      newTreeName = "";
      newTreeDesc = "";
      await invalidateAll(); // Reload server-side data
    } catch (err) {
      toast.error("Failed to create family tree");
      console.error(err);
    } finally {
      isSubmitting = false;
    }
  }

  async function handleDeleteTree(id: string, name: string) {
    if (!confirm(`Are you sure you want to delete "${name}"? This action is permanent and will delete all member nodes and relationships.`)) {
      return;
    }

    try {
      const { error } = await client.api.trees({ id }).delete();

      if (error) {
        throw new Error(error.value as string || "Failed to delete family tree");
      }

      toast.success("Family tree deleted");
      await invalidateAll();
    } catch (err) {
      toast.error("Failed to delete family tree");
      console.error(err);
    }
  }
</script>

<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 flex-1 flex flex-col">
  <!-- Page Header -->
  <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
    <div>
      <h1 class="text-3xl font-bold tracking-tight bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent font-serif">
        Your Family Trees
      </h1>
      <p class="text-muted-foreground mt-1">
        Manage your family lineages, trace connections, and collaborate with family members.
      </p>
    </div>
    <Button onclick={() => showCreateModal = true} class="flex items-center gap-2 shadow-lg">
      <Plus class="h-4 w-4" />
      <span>New Family Tree</span>
    </Button>
  </div>

  {#if data.trees.length === 0}
    <!-- Empty State -->
    <div class="flex-1 flex flex-col items-center justify-center border-2 border-dashed rounded-xl p-12 text-center bg-background/50 backdrop-blur-sm max-w-2xl mx-auto w-full my-auto">
      <div class="p-4 rounded-full bg-primary/10 mb-4">
        <Users class="h-10 w-10 text-primary" />
      </div>
      <h3 class="text-lg font-semibold">No Family Trees Found</h3>
      <p class="text-muted-foreground text-sm max-w-sm mt-2 mb-6">
        Get started by creating your first family tree, or ask a collaborator to invite you to their tree.
      </p>
      <Button onclick={() => showCreateModal = true} class="flex items-center gap-2">
        <Plus class="h-4 w-4" />
        <span>Create Your First Tree</span>
      </Button>
    </div>
  {:else}
    <!-- Trees Grid -->
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {#each data.trees as tree}
        <Card class="group relative flex flex-col overflow-hidden hover:shadow-xl hover:border-primary/40 transition-all duration-300 bg-background/50 backdrop-blur-md">
          <div class="p-6 flex-1 flex flex-col">
            <!-- Header (Name & Role) -->
            <div class="flex items-start justify-between gap-2 mb-3">
              <h3 class="font-serif text-xl font-bold group-hover:text-primary transition-colors line-clamp-1">
                {tree.name}
              </h3>
              
              <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wider
                {tree.role === 'OWNER' ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300' : ''}
                {tree.role === 'EDITOR' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300' : ''}
                {tree.role === 'VIEWER' ? 'bg-zinc-100 text-zinc-800 dark:bg-zinc-900/30 dark:text-zinc-300' : ''}
              ">
                {tree.role}
              </span>
            </div>

            <!-- Description -->
            <p class="text-sm text-muted-foreground line-clamp-3 mb-6 flex-1">
              {tree.description || "No description provided. Add details about this lineage."}
            </p>

            <!-- Metadata (Created At) -->
            <div class="flex items-center gap-4 text-xs text-muted-foreground pt-4 border-t border-muted/50">
              <span class="flex items-center gap-1">
                <Calendar class="h-3.5 w-3.5" />
                <span>{new Date(tree.createdAt).toLocaleDateString()}</span>
              </span>
            </div>
          </div>

          <!-- Hover Overlay Actions -->
          <div class="p-4 bg-muted/30 border-t flex items-center justify-between gap-2">
            <Button href={`/trees/${tree.id}`} variant="default" size="sm" class="flex-1 gap-2">
              {#if tree.role === 'VIEWER'}
                <Eye class="h-4 w-4" />
                <span>View Tree</span>
              {:else}
                <Edit3 class="h-4 w-4" />
                <span>Edit Tree</span>
              {/if}
            </Button>
            
            {#if tree.role === 'OWNER'}
              <Button 
                variant="outline" 
                size="icon" 
                class="text-destructive hover:bg-destructive/10 hover:text-destructive hover:border-destructive/40 border-muted"
                onclick={() => handleDeleteTree(tree.id, tree.name)}
                title="Delete family tree"
              >
                <Trash2 class="h-4 w-4" />
              </Button>
            {/if}
          </div>
        </Card>
      {/each}
    </div>
  {/if}
</div>

<!-- Simple Create Modal (Fallback layout when Dialog triggers aren't global) -->
{#if showCreateModal}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
    <div class="w-full max-w-md bg-background border rounded-xl shadow-2xl p-6 relative animate-in fade-in zoom-in-95 duration-200">
      <h3 class="font-serif text-2xl font-bold mb-2">Create New Tree</h3>
      <p class="text-muted-foreground text-sm mb-4">Add details to start your genealogical trace.</p>

      <form onsubmit={handleCreateTree} class="space-y-4">
        <div class="space-y-2">
          <Label for="tree-name">Family Lineage Name</Label>
          <Input 
            id="tree-name" 
            placeholder="e.g., Nguyễn Gia Tộc, Trần Family Tree" 
            bind:value={newTreeName}
            required
            disabled={isSubmitting}
          />
        </div>

        <div class="space-y-2">
          <Label for="tree-desc">Description</Label>
          <textarea
            id="tree-desc"
            placeholder="Describe the origin, branches, or notes about this lineage..."
            bind:value={newTreeDesc}
            disabled={isSubmitting}
            class="flex min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          ></textarea>
        </div>

        <div class="flex justify-end gap-3 pt-2">
          <Button 
            type="button" 
            variant="ghost" 
            onclick={() => showCreateModal = false}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button 
            type="submit" 
            disabled={isSubmitting}
            class="min-w-[80px]"
          >
            {#if isSubmitting}
              Creating...
            {:else}
              Create
            {/if}
          </Button>
        </div>
      </form>
    </div>
  </div>
{/if}
