<script lang="ts">
  import { invalidateAll } from "$app/navigation";
  import { client } from "$lib";
  import { Button } from "$lib/components/ui/button";
  import { Combobox } from "$lib/components/ui/combobox";
  import { Label } from "$lib/components/ui/label";
  import { X } from "@lucide/svelte";
  import { toast } from "svelte-sonner";
  import { m } from "$lib/paraglide/messages.js";

  let {
    show = $bindable(),
    relSourceId = $bindable(),
    relType = $bindable(),
    relTargetId = $bindable(),
    data,
  }: {
    show: boolean;
    relSourceId: string;
    relType: "PARENT_CHILD" | "SPOUSE";
    relTargetId: string;
    data: any;
  } = $props();

  const sourceNode = $derived(
    data.tree.nodes.find((n: any) => n.id === relSourceId)
  );

  async function handleAddRelationship(e: SubmitEvent) {
    e.preventDefault();
    if (!relTargetId) {
      toast.error(m.target_member_required_error());
      return;
    }

    try {
      const { error } = await client.api.workspace.edges.post({
        sourceId: relSourceId,
        targetId: relTargetId,
        type: relType,
      });

      if (error) {
        throw new Error(
          (error.value as string) || m.relationship_failed()
        );
      }

      toast.success(m.relationship_success());
      show = false;
      await invalidateAll();
    } catch (err) {
      toast.error(m.relationship_failed());
      console.error(err);
    }
  }
</script>

{#if show}
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
  >
    <div
      class="w-full max-w-md bg-background border rounded-xl shadow-2xl p-6 relative animate-in fade-in zoom-in-95 duration-200"
    >
      <button
        onclick={() => (show = false)}
        class="absolute top-4 right-4 text-muted-foreground hover:text-foreground"
      >
        <X class="h-5 w-5" />
      </button>

      <h3 class="font-serif text-2xl font-bold mb-2">{m.establish_relation_title()}</h3>
      <p class="text-muted-foreground text-sm mb-4">
        {@html m.establish_relation_desc({ name: `<strong>${sourceNode?.lastName || ""} ${sourceNode?.firstName}</strong>` })}
      </p>

      <form onsubmit={handleAddRelationship} class="space-y-4">
        <div class="space-y-2">
          <Label for="rel-type">{m.relationship_type_label()}</Label>
          <Combobox
            id="rel-type"
            bind:value={relType}
            options={[
              {
                value: "PARENT_CHILD",
                label: m.parent_child_option(),
              },
              { value: "SPOUSE", label: m.spouse_option() },
            ]}
            placeholder={m.select_relationship_placeholder()}
            searchPlaceholder={m.search_relationship_placeholder()}
          />
        </div>

        <div class="space-y-2">
          <Label for="rel-target">{m.select_target_member_label()}</Label>
          <Combobox
            id="rel-target"
            bind:value={relTargetId}
            options={data.tree.nodes
              .filter((n: any) => n.id !== relSourceId)
              .map((otherNode: any) => ({
                value: otherNode.id,
                label: `${otherNode.lastName || ""} ${otherNode.firstName}`,
              }))}
            placeholder={m.choose_target_placeholder()}
            searchPlaceholder={m.search_target_placeholder()}
          />
        </div>

        <div class="flex justify-end gap-3 pt-2">
          <Button
            type="button"
            variant="ghost"
            onclick={() => (show = false)}
          >
            {m.cancel()}
          </Button>
          <Button type="submit">{m.establish_connection_btn()}</Button>
        </div>
      </form>
    </div>
  </div>
{/if}

