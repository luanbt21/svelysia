<script lang="ts">
  import { invalidateAll } from "$app/navigation";
  import { client } from "$lib";
  import { Button } from "$lib/components/ui/button";
  import { Card } from "$lib/components/ui/card";
  import { Combobox } from "$lib/components/ui/combobox";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  import { Trash2, UserPlus } from "@lucide/svelte";
  import { toast } from "svelte-sonner";
  import { m } from "$lib/paraglide/messages.js";

  let { data } = $props();

  let inviteEmailOrUsername = $state("");
  let inviteRole = $state<"EDITOR" | "VIEWER">("VIEWER");
  let isInviting = $state(false);

  const treeMembers = $derived(data.tree.members || []);

  async function handleInviteCollaborator(e: SubmitEvent) {
    e.preventDefault();
    if (!inviteEmailOrUsername.trim()) return;

    isInviting = true;
    try {
      const { error } = await client.api
        .trees({ id: data.tree.id })
        .members.post({
          emailOrUsername: inviteEmailOrUsername,
          role: inviteRole,
        });

      if (error) {
        throw new Error(
          (error.value as string) || m.invite_failed()
        );
      }

      toast.success(m.invite_success());
      inviteEmailOrUsername = "";
      await invalidateAll();
    } catch (err) {
      toast.error(m.invite_failed());
      console.error(err);
    } finally {
      isInviting = false;
    }
  }

  async function handleRemoveCollaborator(memberId: string) {
    if (!confirm(m.remove_collaborator_confirm())) return;

    try {
      const { error } = await client.api
        .trees({ id: data.tree.id })
        .members({ memberId })
        .delete();

      if (error)
        throw new Error(
          (error.value as string) || m.remove_failed()
        );
      toast.success(m.remove_success());
      await invalidateAll();
    } catch (err) {
      toast.error(m.remove_failed());
      console.error(err);
    }
  }
</script>

<div
  class="max-w-4xl mx-auto px-4 sm:px-6 py-8 flex-1 w-full space-y-8 overflow-y-auto"
>
  <div class="space-y-6">
    <div>
      <h3 class="font-serif text-2xl font-bold">{m.tree_collaboration_title()}</h3>
      <p class="text-muted-foreground text-sm">
        {m.tree_collaboration_desc()}
      </p>
    </div>

    {#if data.role === "OWNER"}
      <Card class="p-6">
        <h4 class="font-serif font-bold mb-3 text-base">
          {m.invite_collaborator_title()}
        </h4>
        <form
          onsubmit={handleInviteCollaborator}
          class="flex flex-col sm:flex-row gap-4 items-end"
        >
          <div class="flex-1 space-y-2">
            <Label for="collab-name">{m.user_email_or_username_label()}</Label>
            <Input
              id="collab-name"
              placeholder={m.enter_email_or_username_placeholder()}
              bind:value={inviteEmailOrUsername}
              disabled={isInviting}
              required
            />
          </div>
          <div class="w-full sm:w-48 space-y-2">
            <Label for="collab-role">{m.access_role_label()}</Label>
            <Combobox
              id="collab-role"
              bind:value={inviteRole}
              disabled={isInviting}
              options={[
                { value: "VIEWER", label: m.viewer_readonly_option() },
                { value: "EDITOR", label: m.editor_can_edit_option() },
              ]}
              placeholder={m.select_access_role_placeholder()}
              searchPlaceholder={m.search_roles_placeholder()}
            />
          </div>
          <Button
            type="submit"
            disabled={isInviting}
            class="w-full sm:w-auto flex items-center gap-1.5"
          >
            <UserPlus class="h-4 w-4" />
            <span>{m.invite_btn()}</span>
          </Button>
        </form>
      </Card>
    {/if}

    <!-- Collaborator List -->
    <div class="space-y-3">
      <h4 class="font-semibold text-sm text-muted-foreground">
        {m.active_collaborators_title()}
      </h4>
      {#if treeMembers.length === 0}
        <p class="text-xs text-muted-foreground italic">
          {m.no_collaborators_found()}
        </p>
      {:else}
        <div
          class="border rounded-xl divide-y bg-background overflow-hidden"
        >
          {#each treeMembers as tm}
            <div class="flex items-center justify-between p-4 text-sm">
              <div class="flex items-center gap-3">
                <div
                  class="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center font-bold text-primary"
                >
                  {tm.user.name
                    ? tm.user.name[0]
                    : tm.user.email
                      ? tm.user.email[0]
                      : "U"}
                </div>
                <div>
                  <span class="font-semibold block"
                    >{tm.user.name ||
                      tm.user.username ||
                      "System User"}</span
                  >
                  <span class="text-xs text-muted-foreground block"
                    >{tm.user.email}</span
                  >
                </div>
              </div>

              <div class="flex items-center gap-4">
                <span
                  class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wider
                  {tm.role === 'OWNER'
                    ? 'bg-amber-100 text-amber-800'
                    : 'bg-blue-100 text-blue-800'}
                "
                >
                  {tm.role}
                </span>

                {#if data.role === "OWNER" && tm.role !== "OWNER"}
                  <Button
                    variant="ghost"
                    size="icon"
                    class="text-destructive hover:bg-destructive/10"
                    onclick={() => handleRemoveCollaborator(tm.id)}
                    title={m.remove_user_tooltip()}
                  >
                    <Trash2 class="h-4 w-4" />
                  </Button>
                {/if}
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  </div>
</div>

