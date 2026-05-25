<script lang="ts">
  import { invalidateAll } from "$app/navigation";
  import { client } from "$lib";
  import { Button } from "$lib/components/ui/button";
  import { Card } from "$lib/components/ui/card";
  import { Combobox } from "$lib/components/ui/combobox";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  import { Plus, Trash2 } from "@lucide/svelte";
  import { toast } from "svelte-sonner";
  import { m } from "$lib/paraglide/messages.js";

  let { data } = $props();

  // Custom Field States
  let newFieldName = $state("");
  let newFieldType = $state<"STRING" | "NUMBER" | "DATE" | "BOOLEAN">("STRING");
  let isCreatingField = $state(false);

  // Custom Kinship Overrides States
  let customKinshipPathKey = $state("");
  let customKinshipTerm = $state("");
  let isSavingKinshipTerm = $state(false);

  async function handleCreateField(e: SubmitEvent) {
    e.preventDefault();
    if (!newFieldName.trim()) return;

    isCreatingField = true;
    try {
      const { error } = await client.api.workspace["custom-fields"].post({
        treeId: data.tree.id,
        name: newFieldName,
        type: newFieldType,
      });

      if (error)
        throw new Error(
          (error.value as string) || m.custom_field_create_failed()
        );
      toast.success(m.custom_field_create_success());
      newFieldName = "";
      await invalidateAll();
    } catch (err) {
      toast.error(m.custom_field_create_failed());
      console.error(err);
    } finally {
      isCreatingField = false;
    }
  }

  async function handleDeleteField(fieldId: string) {
    if (
      !confirm(
        m.delete_custom_field_confirm()
      )
    ) {
      return;
    }
    try {
      const { error } = await client.api.workspace["custom-fields"]({
        id: fieldId,
      }).delete();
      if (error)
        throw new Error(
          (error.value as string) || m.custom_field_delete_failed()
        );
      toast.success(m.custom_field_delete_success());
      await invalidateAll();
    } catch (err) {
      toast.error(m.custom_field_delete_failed());
      console.error(err);
    }
  }

  async function handleSaveKinshipTerm(e: SubmitEvent) {
    e.preventDefault();
    if (!customKinshipPathKey || !customKinshipTerm.trim()) return;

    isSavingKinshipTerm = true;
    try {
      const { error } = await client.api.workspace["kinship-terms"].post({
        treeId: data.tree.id,
        pathKey: customKinshipPathKey,
        term: customKinshipTerm,
      });

      if (error)
        throw new Error(
          (error.value as string) || m.kinship_override_save_failed()
        );
      toast.success(m.kinship_override_save_success());
      customKinshipPathKey = "";
      customKinshipTerm = "";
      await invalidateAll();
    } catch (err) {
      toast.error(m.kinship_override_save_failed());
      console.error(err);
    } finally {
      isSavingKinshipTerm = false;
    }
  }

  async function handleDeleteKinshipTerm(termId: string) {
    if (!confirm(m.remove_override_confirm())) return;
    try {
      const { error } = await client.api.workspace["kinship-terms"]({
        id: termId,
      }).delete();
      if (error)
        throw new Error((error.value as string) || m.kinship_override_remove_failed());
      toast.success(m.kinship_override_remove_success());
      await invalidateAll();
    } catch (err) {
      toast.error(m.kinship_override_remove_failed());
      console.error(err);
    }
  }
</script>

<div
  class="max-w-4xl mx-auto px-4 sm:px-6 py-8 flex-1 w-full space-y-8 overflow-y-auto"
>
  <!-- CUSTOM FIELDS SECTION -->
  <div class="space-y-6">
    <div>
      <h3 class="font-serif text-2xl font-bold">{m.dynamic_profile_schema_title()}</h3>
      <p class="text-muted-foreground text-sm font-serif">
        {m.dynamic_profile_schema_desc()}
      </p>
    </div>

    {#if data.role === "OWNER"}
      <Card class="p-6">
        <h4 class="font-bold mb-3 text-base font-serif">{m.create_custom_field_title()}</h4>
        <form
          onsubmit={handleCreateField}
          class="flex flex-col sm:flex-row gap-4 items-end"
        >
          <div class="flex-1 space-y-2">
            <Label for="field-name">{m.field_label_label()}</Label>
            <Input
              id="field-name"
              placeholder={m.field_label_placeholder()}
              bind:value={newFieldName}
              disabled={isCreatingField}
              required
            />
          </div>
          <div class="w-full sm:w-48 space-y-2">
            <Label for="field-type">{m.field_data_type_label()}</Label>
            <Combobox
              id="field-type"
              bind:value={newFieldType}
              disabled={isCreatingField}
              options={[
                { value: "STRING", label: m.text_string_option() },
                { value: "NUMBER", label: m.number_option() },
                { value: "DATE", label: m.gregorian_date_option() },
                { value: "BOOLEAN", label: m.yes_no_boolean_option() },
              ]}
              placeholder={m.select_field_type_placeholder()}
              searchPlaceholder={m.search_field_types_placeholder()}
            />
          </div>
          <Button
            type="submit"
            disabled={isCreatingField}
            class="w-full sm:w-auto flex items-center gap-1.5"
          >
            <Plus class="h-4 w-4" />
            <span>{m.add_field_btn()}</span>
          </Button>
        </form>
      </Card>
    {/if}

    <!-- Custom Fields List -->
    <div class="space-y-3">
      <h4 class="font-semibold text-sm text-muted-foreground">{m.active_fields_definition_title()}</h4>
      {#if data.tree.fields.length === 0}
        <div
          class="border rounded-xl p-8 text-center text-muted-foreground bg-background/50"
        >
          {m.no_custom_fields_defined()}
        </div>
      {:else}
        <div class="border rounded-xl divide-y bg-background overflow-hidden">
          {#each data.tree.fields as field}
            <div class="flex items-center justify-between p-4 text-sm">
              <div>
                <span class="font-semibold block">{field.name}</span>
                <span class="text-xs text-muted-foreground block">Type: {field.type}</span>
              </div>

              {#if data.role === "OWNER"}
                <Button
                  variant="ghost"
                  size="icon"
                  class="text-destructive hover:bg-destructive/10"
                  onclick={() => handleDeleteField(field.id)}
                  title={m.delete_custom_field_definition_tooltip()}
                >
                  <Trash2 class="h-4 w-4" />
                </Button>
              {/if}
            </div>
          {/each}
        </div>
      {/if}
    </div>
  </div>

  <!-- KINSHIP TERM OVERRIDES SECTION -->
  <div class="border-t pt-8 space-y-6">
    <div>
      <h3 class="font-serif text-2xl font-bold">{m.kinship_term_overrides_title()}</h3>
      <p class="text-muted-foreground text-sm font-serif">
        {m.kinship_term_overrides_desc()}
      </p>
    </div>

    {#if data.role === "OWNER"}
      <Card class="p-6">
        <h4 class="font-bold mb-3 text-base font-serif">{m.create_kinship_override_title()}</h4>
        <form
          onsubmit={handleSaveKinshipTerm}
          class="flex flex-col sm:flex-row gap-4 items-end"
        >
          <div class="flex-1 space-y-2">
            <Label for="path-key">{m.path_key_label()}</Label>
            <Combobox
              id="path-key"
              bind:value={customKinshipPathKey}
              options={[
                { value: "SPOUSE", label: m.spouse_path_option() },
                { value: "PARENT", label: m.parent_path_option() },
                { value: "CHILD", label: m.child_path_option() },
                { value: "PARENT.CHILD", label: m.sibling_path_option() },
                { value: "PARENT.PARENT", label: m.grandparent_path_option() },
                { value: "CHILD.CHILD", label: m.grandchild_path_option() },
                {
                  value: "PARENT.PARENT.CHILD",
                  label: m.aunt_uncle_path_option(),
                },
                {
                  value: "PARENT.PARENT.CHILD.CHILD",
                  label: m.cousin_path_option(),
                },
              ]}
              placeholder={m.choose_relationship_path_placeholder()}
              searchPlaceholder={m.search_paths_placeholder()}
            />
          </div>
          <div class="flex-1 space-y-2">
            <Label for="custom-term">{m.custom_term_translation_label()}</Label>
            <Input
              id="custom-term"
              placeholder={m.custom_term_translation_placeholder()}
              bind:value={customKinshipTerm}
              disabled={isSavingKinshipTerm}
              required
            />
          </div>
          <Button
            type="submit"
            disabled={isSavingKinshipTerm}
            class="w-full sm:w-auto flex items-center gap-1.5"
          >
            <Plus class="h-4 w-4" />
            <span>{m.save_override_btn()}</span>
          </Button>
        </form>
      </Card>
    {/if}

    <!-- Overrides List -->
    <div class="space-y-3">
      <h4 class="font-semibold text-sm text-muted-foreground">{m.active_term_overrides_title()}</h4>
      {#if !data.tree.customTerms || data.tree.customTerms.length === 0}
        <div
          class="border rounded-xl p-8 text-center text-muted-foreground bg-background/50"
        >
          {m.no_custom_kinship_overrides()}
        </div>
      {:else}
        <div class="border rounded-xl divide-y bg-background overflow-hidden">
          {#each data.tree.customTerms as term}
            <div class="flex items-center justify-between p-4 text-sm">
              <div>
                <span class="font-semibold block">{term.term}</span>
                <span class="text-xs text-muted-foreground block">Path Key: {term.pathKey}</span>
              </div>

              {#if data.role === "OWNER"}
                <Button
                  variant="ghost"
                  size="icon"
                  class="text-destructive hover:bg-destructive/10"
                  onclick={() => handleDeleteKinshipTerm(term.id)}
                  title={m.delete_override_tooltip()}
                >
                  <Trash2 class="h-4 w-4" />
                </Button>
              {/if}
            </div>
          {/each}
        </div>
      {/if}
    </div>
  </div>
</div>
