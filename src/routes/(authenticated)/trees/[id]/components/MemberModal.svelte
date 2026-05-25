<script lang="ts">
  import { invalidateAll } from "$app/navigation";
  import { client } from "$lib";
  import { Button } from "$lib/components/ui/button";
  import { Combobox } from "$lib/components/ui/combobox";
  import { DatePicker } from "$lib/components/ui/date-picker";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  import { X } from "@lucide/svelte";
  import { toast } from "svelte-sonner";
  import { m } from "$lib/paraglide/messages.js";

  interface PendingRelation {
    type: "SPOUSE" | "CHILD" | "SIBLING" | "PARENT";
    sourceId: string;
    gender?: "MALE" | "FEMALE";
  }

  let {
    show = $bindable(),
    isEditingMember = $bindable(),
    editingNodeId = $bindable(),
    pendingRelation = $bindable(),
    data,
  }: {
    show: boolean;
    isEditingMember: boolean;
    editingNodeId: string | null;
    pendingRelation: PendingRelation | null;
    data: any;
  } = $props();

  let nodeForm = $state({
    firstName: "",
    lastName: "",
    gender: "MALE" as "MALE" | "FEMALE",
    birthDate: "",
    deathDate: "",
    lunarBirthDate: "",
    lunarDeathDate: "",
    phone: "",
    email: "",
    major: "",
    jobPosition: "",
    customFields: [] as { fieldId: string; value: string }[],
  });

  // Track the previous show status to know when it opens
  let prevShow = false;

  $effect(() => {
    if (show && !prevShow) {
      // Modal opened, initialize form
      if (isEditingMember && editingNodeId) {
        const node = data.tree.nodes.find((n: any) => n.id === editingNodeId);
        if (node) {
          nodeForm = {
            firstName: node.firstName,
            lastName: node.lastName || "",
            gender: node.gender,
            birthDate: node.birthDate
              ? new Date(node.birthDate).toISOString().split("T")[0]
              : "",
            deathDate: node.deathDate
              ? new Date(node.deathDate).toISOString().split("T")[0]
              : "",
            lunarBirthDate: node.lunarBirthDate || "",
            lunarDeathDate: node.lunarDeathDate || "",
            phone: node.phone || "",
            email: node.email || "",
            major: node.major || "",
            jobPosition: node.jobPosition || "",
            customFields: data.tree.fields.map((f: any) => {
              const existingVal = node.customValues.find((cv: any) => cv.fieldId === f.id);
              return { fieldId: f.id, value: existingVal ? existingVal.value : "" };
            }),
          };
        }
      } else {
        // Adding new member
        let lastName = "";
        let gender: "MALE" | "FEMALE" = "MALE";

        if (pendingRelation) {
          const rel = pendingRelation;
          const sourceNode = data.tree.nodes.find((n: any) => n.id === rel.sourceId);
          if (sourceNode) {
            lastName = sourceNode.lastName || "";
            if (rel.type === "SPOUSE") {
              gender = sourceNode.gender === "MALE" ? "FEMALE" : "MALE";
            } else if (rel.type === "PARENT" && rel.gender) {
              gender = rel.gender;
              lastName = gender === "MALE" ? sourceNode.lastName || "" : "";
            }
          }
        }

        nodeForm = {
          firstName: "",
          lastName,
          gender,
          birthDate: "",
          deathDate: "",
          lunarBirthDate: "",
          lunarDeathDate: "",
          phone: "",
          email: "",
          major: "",
          jobPosition: "",
          customFields: data.tree.fields.map((f: any) => ({
            fieldId: f.id,
            value: "",
          })),
        };
      }
    }
    prevShow = show;
  });

  async function handleSaveMember(e: SubmitEvent) {
    e.preventDefault();
    if (!nodeForm.firstName.trim()) {
      toast.error(m.firstname_required_error());
      return;
    }
    if (!nodeForm.birthDate) {
      toast.error(m.birthdate_required_error());
      return;
    }

    try {
      const payload = {
        treeId: data.tree.id,
        firstName: nodeForm.firstName,
        lastName: nodeForm.lastName || undefined,
        gender: nodeForm.gender,
        birthDate: new Date(nodeForm.birthDate).toISOString(),
        deathDate: nodeForm.deathDate
          ? new Date(nodeForm.deathDate).toISOString()
          : undefined,
        lunarBirthDate: nodeForm.lunarBirthDate || undefined,
        lunarDeathDate: nodeForm.lunarDeathDate || undefined,
        phone: nodeForm.phone || undefined,
        email: nodeForm.email || undefined,
        major: nodeForm.major || undefined,
        jobPosition: nodeForm.jobPosition || undefined,
        customFields: nodeForm.customFields,
      };

      if (isEditingMember && !editingNodeId) {
        toast.error(m.no_member_selected_error());
        return;
      }

      const response = isEditingMember
        ? await client.api.workspace
            .nodes({ id: editingNodeId! })
            .patch(payload)
        : await client.api.workspace.nodes.post(payload);

      if (typeof response.data === "string") {
        toast.error(response.data);
        return;
      }

      if (response.error) {
        throw new Error(
          typeof response.error.value === "string"
            ? response.error.value
            : response.error.value?.message || m.member_save_failed(),
        );
      }

      const newNode = response.data;
      if (!isEditingMember && newNode && pendingRelation) {
        const { type, sourceId } = pendingRelation;

        if (type === "SPOUSE") {
          const { error: relError } = await client.api.workspace.edges.post({
            sourceId,
            targetId: newNode.id,
            type: "SPOUSE",
          });
          if (relError)
            console.error("Failed to establish spouse connection:", relError);
        } else if (type === "CHILD") {
          const { error: relError } = await client.api.workspace.edges.post({
            sourceId,
            targetId: newNode.id,
            type: "PARENT_CHILD",
          });
          if (relError)
            console.error("Failed to establish child connection:", relError);
        } else if (type === "SIBLING") {
          const parentRels = data.tree.nodes
            .flatMap((n: any) => n.relationsAsSource)
            .filter(
              (r: any) => r.targetId === sourceId && r.type === "PARENT_CHILD",
            );

          for (const rel of parentRels) {
            const { error: relError } = await client.api.workspace.edges.post({
              sourceId: rel.sourceId,
              targetId: newNode.id,
              type: "PARENT_CHILD",
            });
            if (relError)
              console.error(
                `Failed to link parent ${rel.sourceId} to sibling:`,
                relError,
              );
          }
        } else if (type === "PARENT") {
          const { error: relError } = await client.api.workspace.edges.post({
            sourceId: newNode.id,
            targetId: sourceId,
            type: "PARENT_CHILD",
          });
          if (relError)
            console.error("Failed to establish parent connection:", relError);
        }
      }

      // Reset pending relation state
      pendingRelation = null;

      toast.success(
        isEditingMember
          ? m.member_update_success()
          : m.member_add_success(),
      );
      show = false;
      await invalidateAll();
    } catch (err) {
      toast.error(m.member_save_failed());
      console.error(err);
    }
  }
</script>

{#if show}
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto"
  >
    <div
      class="w-full max-w-2xl bg-background border rounded-xl shadow-2xl p-6 relative my-8 animate-in fade-in zoom-in-95 duration-200"
    >
      <button
        onclick={() => (show = false)}
        class="absolute top-4 right-4 text-muted-foreground hover:text-foreground"
      >
        <X class="h-5 w-5" />
      </button>

      <h3 class="font-serif text-2xl font-bold mb-2">
        {isEditingMember ? m.edit_profile_title() : m.add_member_title()}
      </h3>
      <p class="text-muted-foreground text-sm mb-4">
        {m.member_modal_desc()}
      </p>

      <form onsubmit={handleSaveMember} class="space-y-6">
        <!-- Name & Gender -->
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div class="space-y-2">
            <Label for="node-lastname">{m.lastname_label()}</Label>
            <Input
              id="node-lastname"
              placeholder={m.lastname_placeholder()}
              bind:value={nodeForm.lastName}
            />
          </div>
          <div class="space-y-2">
            <Label for="node-firstname">{m.firstname_label()}</Label>
            <Input
              id="node-firstname"
              placeholder={m.firstname_placeholder()}
              bind:value={nodeForm.firstName}
              required
            />
          </div>
          <div class="space-y-2">
            <Label for="node-gender">{m.gender_label()}</Label>
            <Combobox
              id="node-gender"
              bind:value={nodeForm.gender}
              options={[
                { value: "MALE", label: m.gender_male() },
                { value: "FEMALE", label: m.gender_female() },
              ]}
              placeholder={m.select_gender_placeholder()}
              searchPlaceholder={m.search_genders_placeholder()}
            />
          </div>
        </div>

        <!-- Dates (Gregorian and Lunar) -->
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t pt-4">
          <div class="space-y-2">
            <Label for="node-birth">{m.gregorian_birth_label()}</Label>
            <DatePicker
              id="node-birth"
              bind:value={nodeForm.birthDate}
              placeholder={m.select_birth_date_placeholder()}
            />
          </div>
          <div class="space-y-2">
            <Label for="node-lunar-birth">{m.lunar_birth_label()}</Label>
            <Input
              id="node-lunar-birth"
              placeholder={m.lunar_birth_placeholder()}
              bind:value={nodeForm.lunarBirthDate}
            />
          </div>
          <div class="space-y-2">
            <Label for="node-death">{m.gregorian_death_label()}</Label>
            <DatePicker
              id="node-death"
              bind:value={nodeForm.deathDate}
              placeholder={m.select_death_date_placeholder()}
            />
          </div>
          <div class="space-y-2">
            <Label for="node-lunar-death">{m.lunar_death_label()}</Label>
            <Input
              id="node-lunar-death"
              placeholder={m.lunar_death_placeholder()}
              bind:value={nodeForm.lunarDeathDate}
            />
          </div>
        </div>

        <!-- Career & Contact -->
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t pt-4">
          <div class="space-y-2">
            <Label for="node-phone">{m.phone_number_label()}</Label>
            <Input
              id="node-phone"
              placeholder={m.phone_placeholder()}
              bind:value={nodeForm.phone}
            />
          </div>
          <div class="space-y-2">
            <Label for="node-email">{m.email_address_label()}</Label>
            <Input
              type="email"
              id="node-email"
              placeholder={m.email_placeholder()}
              bind:value={nodeForm.email}
            />
          </div>
          <div class="space-y-2">
            <Label for="node-major">{m.field_of_study_label()}</Label>
            <Input
              id="node-major"
              placeholder={m.major_placeholder()}
              bind:value={nodeForm.major}
            />
          </div>
          <div class="space-y-2">
            <Label for="node-job">{m.job_label()}</Label>
            <Input
              id="node-job"
              placeholder={m.job_placeholder()}
              bind:value={nodeForm.jobPosition}
            />
          </div>
        </div>

        <!-- Custom Fields inputs -->
        {#if data.tree.fields.length > 0}
          <div class="border-t pt-4 space-y-4">
            <h4
              class="font-serif font-bold text-sm uppercase tracking-wider text-muted-foreground"
            >
              {m.bespoke_fields_title()}
            </h4>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {#each data.tree.fields as field, i}
                <div class="space-y-2">
                  <Label for={`cf-${field.id}`}>{field.name}</Label>
                  {#if field.type === "BOOLEAN"}
                    <Combobox
                      id={`cf-${field.id}`}
                      bind:value={nodeForm.customFields[i].value}
                      options={[
                        { value: "true", label: m.yes() },
                        { value: "false", label: m.no() },
                      ]}
                      placeholder={m.choose_placeholder()}
                      searchPlaceholder={m.search_placeholder()}
                    />
                  {:else if field.type === "DATE"}
                    <DatePicker
                      id={`cf-${field.id}`}
                      bind:value={nodeForm.customFields[i].value}
                      placeholder={m.select_date_placeholder()}
                    />
                  {:else if field.type === "NUMBER"}
                    <Input
                      type="number"
                      id={`cf-${field.id}`}
                      bind:value={nodeForm.customFields[i].value}
                    />
                  {:else}
                    <Input
                      id={`cf-${field.id}`}
                      bind:value={nodeForm.customFields[i].value}
                      placeholder={m.enter_value_placeholder()}
                    />
                  {/if}
                </div>
              {/each}
            </div>
          </div>
        {/if}

        <div class="flex justify-end gap-3 border-t pt-4">
          <Button
            type="button"
            variant="ghost"
            onclick={() => (show = false)}
          >
            {m.cancel()}
          </Button>
          <Button type="submit">{m.save_details()}</Button>
        </div>
      </form>
    </div>
  </div>
{/if}
