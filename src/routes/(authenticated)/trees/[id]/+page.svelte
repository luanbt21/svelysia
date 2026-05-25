<script lang="ts">
  import { invalidateAll } from "$app/navigation";
  import { client } from "$lib";
  import { Button } from "$lib/components/ui/button";
  import { Card } from "$lib/components/ui/card";
  import { Combobox } from "$lib/components/ui/combobox";
  import { Label } from "$lib/components/ui/label";
  import { calculateKinship } from "$lib/utils/kinship";
  import {
    computeTreeLayout,
    type TreeLayoutEdge,
    type TreeLayoutNode,
  } from "$lib/utils/tree-layout";
  import {
    Briefcase,
    ChevronDown,
    ChevronUp,
    Eye,
    EyeOff,
    HelpCircle,
    Info,
    Mail,
    Maximize2,
    Phone,
    Plus,
    UserPlus,
    Users,
    X,
    ZoomIn,
    ZoomOut,
  } from "@lucide/svelte";
  import { toast } from "svelte-sonner";
  import MemberModal from "./components/MemberModal.svelte";
  import RelationshipModal from "./components/RelationshipModal.svelte";
  import { m } from "$lib/paraglide/messages.js";

  let { data } = $props();

  // Visual Canvas States
  let scale = $state(1);
  let panX = $state(50);
  let panY = $state(50);
  let isDragging = $state(false);
  let dragStart = $state({ x: 0, y: 0 });
  let canvasContainerElement: HTMLDivElement | undefined = $state();

  // Collapsed branches state
  let collapsedNodes = $state(new Set<string>());
  let collapsedAncestors = $state(new Set<string>());
  let userHiddenNodes = $state(new Set<string>());
  let focusedRootNodeId = $state<string | null>(null);
  let cognatesRootNodeId = $state<string | null>(null);

  // Selection
  let selectedNodeId = $state<string | null>(null);

  // Modals / Dialogs
  let showMemberModal = $state(false);
  let isEditingMember = $state(false);
  let editingNodeId = $state<string | null>(null);

  interface PendingRelation {
    type: "SPOUSE" | "CHILD" | "SIBLING" | "PARENT";
    sourceId: string;
    gender?: "MALE" | "FEMALE";
  }
  let pendingRelation = $state<PendingRelation | null>(null);

  let showRelationshipModal = $state(false);
  let relSourceId = $state("");
  let relType = $state<"PARENT_CHILD" | "SPOUSE">("PARENT_CHILD");
  let relTargetId = $state("");

  // Kinship target node selection
  let kinshipTargetId = $state<string>("");

  // Derived tree layout
  const layout = $derived.by(() => {
    // Filter out nodes that are descendants of collapsed nodes
    const hiddenNodes = new Set<string>();
    const gatherDescendants = (parentId: string) => {
      const children = data.tree.nodes.filter((n: any) =>
        data.tree.nodes.some(
          (possibleParent: any) =>
            possibleParent.id === parentId &&
            possibleParent.relationsAsSource.some(
              (rel: any) => rel.targetId === n.id && rel.type === "PARENT_CHILD",
            ),
        ),
      );
      for (const child of children) {
        hiddenNodes.add(child.id);
        gatherDescendants(child.id);
      }
    };

    const gatherAncestors = (childId: string) => {
      const parents = data.tree.nodes.filter((n: any) =>
        data.tree.nodes.some(
          (possibleChild: any) =>
            possibleChild.id === childId &&
            n.relationsAsSource.some(
              (rel: any) =>
                rel.targetId === possibleChild.id &&
                rel.type === "PARENT_CHILD",
            ),
        ),
      );
      for (const parent of parents) {
        hiddenNodes.add(parent.id);
        gatherAncestors(parent.id);
      }
    };

    for (const collapsedId of collapsedNodes) {
      gatherDescendants(collapsedId);
    }

    for (const collapsedId of collapsedAncestors) {
      gatherAncestors(collapsedId);
    }

    // Isolate subtree of nodes if focusedRootNodeId is set
    const allowedBySubtreeFocus = new Set<string>();
    if (focusedRootNodeId) {
      const gatherAllowedNodes = (nodeId: string) => {
        if (allowedBySubtreeFocus.has(nodeId)) return;
        allowedBySubtreeFocus.add(nodeId);

        // Add spouses of this node
        const spouses = data.tree.nodes
          .flatMap((n: any) => n.relationsAsSource)
          .filter(
            (e: any) =>
              e.type === "SPOUSE" &&
              (e.sourceId === nodeId || e.targetId === nodeId),
          )
          .map((e: any) => (e.sourceId === nodeId ? e.targetId : e.sourceId));
        for (const spouseId of spouses) {
          allowedBySubtreeFocus.add(spouseId);
        }

        // Add children
        const children = data.tree.nodes.filter((n: any) =>
          data.tree.nodes.some(
            (possibleParent: any) =>
              possibleParent.id === nodeId &&
              possibleParent.relationsAsSource.some(
                (rel: any) => rel.targetId === n.id && rel.type === "PARENT_CHILD",
              ),
          ),
        );
        for (const child of children) {
          gatherAllowedNodes(child.id);
        }
      };

      gatherAllowedNodes(focusedRootNodeId);
    }

    // Filter to blood relatives/cognates of cognatesRootNodeId if filter active
    const cognates = new Set<string>();
    if (cognatesRootNodeId) {
      const ancestors = new Set<string>();
      const queue = [cognatesRootNodeId];
      ancestors.add(cognatesRootNodeId);

      while (queue.length > 0) {
        const currId = queue.shift()!;

        // Find parents of currId
        const parents = data.tree.nodes.filter((parent: any) =>
          parent.relationsAsSource.some(
            (rel: any) => rel.targetId === currId && rel.type === "PARENT_CHILD",
          ),
        );
        for (const parent of parents) {
          if (!ancestors.has(parent.id)) {
            ancestors.add(parent.id);
            queue.push(parent.id);
          }
        }
      }

      // Gather all descendants of all ancestors
      const descQueue = Array.from(ancestors);
      for (const id of descQueue) {
        cognates.add(id);
      }

      while (descQueue.length > 0) {
        const currId = descQueue.shift()!;

        // Find children of currId
        const children = data.tree.nodes.filter((child: any) =>
          child.relationsAsTarget.some(
            (rel: any) => rel.sourceId === currId && rel.type === "PARENT_CHILD",
          ),
        );
        for (const child of children) {
          if (!cognates.has(child.id)) {
            cognates.add(child.id);
            descQueue.push(child.id);
          }
        }
      }
    }

    // Calculate fully user hidden nodes and their subtrees (with parent preservation logic)
    const fullyHiddenNodes = new Set<string>();
    for (const id of userHiddenNodes) {
      fullyHiddenNodes.add(id);
    }

    let changed = true;
    while (changed) {
      changed = false;
      for (const n of data.tree.nodes) {
        if (fullyHiddenNodes.has(n.id)) continue;

        // Find parents of n
        const parents = data.tree.nodes.filter((parent: any) =>
          parent.relationsAsSource.some(
            (rel: any) => rel.targetId === n.id && rel.type === "PARENT_CHILD",
          ),
        );

        // n is hidden if it has parents and ALL of its parents are hidden
        if (
          parents.length > 0 &&
          parents.every((p: any) => fullyHiddenNodes.has(p.id))
        ) {
          fullyHiddenNodes.add(n.id);
          changed = true;
        }
      }
    }

    const filteredNodes = data.tree.nodes.filter((n: any) => {
      if (hiddenNodes.has(n.id)) return false;
      if (fullyHiddenNodes.has(n.id)) return false;
      if (focusedRootNodeId && !allowedBySubtreeFocus.has(n.id)) {
        return false;
      }
      if (cognatesRootNodeId && !cognates.has(n.id)) {
        return false;
      }
      return true;
    });
    const nodeIds = new Set(filteredNodes.map((n: any) => n.id));
    const filteredEdges = (
      data.tree.nodes.flatMap((n: any) => n.relationsAsSource) as TreeLayoutEdge[]
    ).filter((e) => nodeIds.has(e.sourceId) && nodeIds.has(e.targetId));

    // Standardize nodes for layout algorithm
    const standardNodes: TreeLayoutNode[] = filteredNodes.map((n: any) => ({
      id: n.id,
      firstName: n.firstName,
      lastName: n.lastName,
      gender: n.gender,
      birthDate: n.birthDate,
      deathDate: n.deathDate,
      lunarBirthDate: n.lunarBirthDate,
      lunarDeathDate: n.lunarDeathDate,
      phone: n.phone,
      email: n.email,
      major: n.major,
      jobPosition: n.jobPosition,
    }));

    return computeTreeLayout(standardNodes, filteredEdges);
  });

  // Find currently selected node full details
  const selectedNode = $derived(
    data.tree.nodes.find((n: any) => n.id === selectedNodeId),
  );

  const selectedSourceRels = $derived(
    selectedNode ? selectedNode.relationsAsSource : [],
  );
  const selectedTargetRels = $derived(
    selectedNode ? selectedNode.relationsAsTarget : [],
  );

  // Find all spouses bidirectionally
  const selectedSpouses = $derived.by(() => {
    if (!selectedNode) return [];
    const spouseEdges = data.tree.nodes
      .flatMap((n: any) => n.relationsAsSource)
      .filter(
        (e: any) =>
          e.type === "SPOUSE" &&
          (e.sourceId === selectedNode.id || e.targetId === selectedNode.id),
      );
    return spouseEdges
      .map((rel: any) => {
        const spouseId =
          rel.sourceId === selectedNode.id ? rel.targetId : rel.sourceId;
        const spouseNode = data.tree.nodes.find((n: any) => n.id === spouseId);
        return { relId: rel.id, spouseNode };
      })
      .filter((item: any) => item.spouseNode !== undefined) as {
      relId: string;
      spouseNode: typeof selectedNode;
    }[];
  });

  // Compute dynamic timeline for selected node
  const selectedTimeline = $derived.by(() => {
    if (!selectedNode) return [];
    const events: {
      year: number;
      text: string;
      date?: string;
      type: string;
    }[] = [];

    // Birth
    if (selectedNode.birthDate) {
      const birth = new Date(selectedNode.birthDate);
      events.push({
        year: birth.getFullYear(),
        text: `${m.timeline_event_born()}${selectedNode.lunarBirthDate ? ` (${m.lunar_birth_date()}: ${selectedNode.lunarBirthDate})` : ""}`,
        date: birth.toLocaleDateString(),
        type: "birth",
      });
    }

    // Spouses
    const spouseEdges = data.tree.nodes
      .flatMap((n: any) => n.relationsAsSource)
      .filter(
        (e: any) =>
          e.type === "SPOUSE" &&
          (e.sourceId === selectedNode.id || e.targetId === selectedNode.id),
      );
    for (const edge of spouseEdges) {
      const partnerId =
        edge.sourceId === selectedNode.id ? edge.targetId : edge.sourceId;
      const partner = data.tree.nodes.find((n: any) => n.id === partnerId);
      if (partner) {
        events.push({
          year:
            (edge.metadata as any)?.year ||
            new Date(partner.birthDate).getFullYear(),
          text: m.timeline_event_married({ name: `${partner.lastName || ""} ${partner.firstName}` }),
          type: "spouse",
        });
      }
    }

    // Children
    const childrenEdges = data.tree.nodes
      .flatMap((n: any) => n.relationsAsSource)
      .filter(
        (e: any) => e.type === "PARENT_CHILD" && e.sourceId === selectedNode.id,
      );
    for (const edge of childrenEdges) {
      const child = data.tree.nodes.find((n: any) => n.id === edge.targetId);
      if (child) {
        events.push({
          year: new Date(child.birthDate).getFullYear(),
          text: m.timeline_event_had_child({ name: `${child.lastName || ""} ${child.firstName}` }),
          date: new Date(child.birthDate).toLocaleDateString(),
          type: "child",
        });
      }
    }

    // Death
    if (selectedNode.deathDate) {
      const death = new Date(selectedNode.deathDate);
      events.push({
        year: death.getFullYear(),
        text: `${m.timeline_event_passed_away()}${selectedNode.lunarDeathDate ? ` (${m.lunar_death_date()}: ${selectedNode.lunarDeathDate})` : ""}`,
        date: death.toLocaleDateString(),
        type: "death",
      });
    }

    return events.sort((a, b) => a.year - b.year);
  });

  // Derived kinship calculation
  const kinshipCalculated = $derived.by(() => {
    if (!selectedNodeId || !kinshipTargetId) return null;
    const allEdges: TreeLayoutEdge[] = data.tree.nodes
      .flatMap((n: any) => n.relationsAsSource)
      .map((e: any) => ({
        id: e.id,
        sourceId: e.sourceId,
        targetId: e.targetId,
        type: e.type,
        order: e.order,
      }));
    return calculateKinship(
      selectedNodeId,
      kinshipTargetId,
      data.tree.nodes,
      allEdges,
      data.tree.customTerms,
    );
  });

  // Pan Zoom actions
  function handleMouseDown(e: MouseEvent) {
    if (e.button !== 0) return; // Only left click drag

    const target = e.target as HTMLElement;
    if (
      target.closest(".node-card") ||
      target.closest("button") ||
      target.closest("input") ||
      target.closest(".sidebar-container")
    ) {
      return;
    }

    isDragging = true;
    dragStart = { x: e.clientX - panX, y: e.clientY - panY };
  }

  function handleMouseMove(e: MouseEvent) {
    if (!isDragging) return;
    panX = e.clientX - dragStart.x;
    panY = e.clientY - dragStart.y;
  }

  function handleMouseUp() {
    isDragging = false;
  }

  function handleWheel(e: WheelEvent) {
    e.preventDefault();
    const zoomFactor = 1.1;
    let nextScale = scale;
    if (e.deltaY < 0) {
      nextScale = Math.min(scale * zoomFactor, 2.5);
    } else {
      nextScale = Math.max(scale / zoomFactor, 0.2);
    }

    if (canvasContainerElement) {
      const rect = canvasContainerElement.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      panX = mouseX - (mouseX - panX) * (nextScale / scale);
      panY = mouseY - (mouseY - panY) * (nextScale / scale);
    }

    scale = nextScale;
  }

  function zoomIn() {
    scale = Math.min(scale * 1.2, 2.5);
  }

  function zoomOut() {
    scale = Math.max(scale / 1.2, 0.2);
  }

  function fitView() {
    if (layout.renderNodes.length === 0) return;

    const minX = Math.min(...layout.renderNodes.map((n) => n.x));
    const maxX = Math.max(...layout.renderNodes.map((n) => n.x + n.width));
    const minY = Math.min(...layout.renderNodes.map((n) => n.y));
    const maxY = Math.max(...layout.renderNodes.map((n) => n.y + n.height));

    const contentWidth = maxX - minX;
    const contentHeight = maxY - minY;

    if (canvasContainerElement) {
      const rect = canvasContainerElement.getBoundingClientRect();
      const scaleX = rect.width / (contentWidth + 100);
      const scaleY = rect.height / (contentHeight + 100);
      scale = Math.max(0.3, Math.min(scaleX, scaleY, 1.2));

      panX = (rect.width - contentWidth * scale) / 2 - minX * scale;
      panY = (rect.y - contentHeight * scale) / 4 - minY * scale + 64;
    }
  }

  // Branch Collapsing
  function toggleCollapse(nodeId: string) {
    if (collapsedNodes.has(nodeId)) {
      collapsedNodes.delete(nodeId);
    } else {
      collapsedNodes.add(nodeId);
    }
    collapsedNodes = new Set(collapsedNodes);
  }

  // Collapse Ancestors
  function toggleCollapseAncestors(nodeId: string) {
    if (collapsedAncestors.has(nodeId)) {
      collapsedAncestors.delete(nodeId);
    } else {
      collapsedAncestors.add(nodeId);
    }
    collapsedAncestors = new Set(collapsedAncestors);

    setTimeout(() => {
      centerOnNode(nodeId);
    }, 50);
  }

  function hideNode(nodeId: string) {
    userHiddenNodes.add(nodeId);
    userHiddenNodes = new Set(userHiddenNodes);
    if (selectedNodeId === nodeId) {
      selectedNodeId = null;
    }
    toast.success(m.member_hidden_toast());
  }

  function unhideNode(nodeId: string) {
    userHiddenNodes.delete(nodeId);
    userHiddenNodes = new Set(userHiddenNodes);
    toast.success(m.member_restored_toast());
  }

  function focusSubtree(nodeId: string) {
    focusedRootNodeId = nodeId;
    setTimeout(() => {
      centerOnNode(nodeId);
    }, 50);
  }

  function resetFocusSubtree() {
    focusedRootNodeId = null;
  }

  function setCognatesRootNode(nodeId: string) {
    cognatesRootNodeId = nodeId;
    setTimeout(() => {
      centerOnNode(nodeId);
    }, 50);
  }

  function resetCognatesRootNode() {
    cognatesRootNodeId = null;
  }

  // Form helpers
  function openAddMember() {
    isEditingMember = false;
    editingNodeId = null;
    pendingRelation = null;
    showMemberModal = true;
  }

  function openEditMember(node: any) {
    if (!node) return;
    isEditingMember = true;
    editingNodeId = node.id;
    showMemberModal = true;
  }

  function openQuickAddSpouse(sourceNode: any) {
    if (!sourceNode) return;
    isEditingMember = false;
    editingNodeId = null;
    pendingRelation = { type: "SPOUSE", sourceId: sourceNode.id };
    showMemberModal = true;
  }

  function openQuickAddChild(sourceNode: any) {
    if (!sourceNode) return;
    isEditingMember = false;
    editingNodeId = null;
    pendingRelation = { type: "CHILD", sourceId: sourceNode.id };
    showMemberModal = true;
  }

  function openQuickAddSibling(sourceNode: any) {
    if (!sourceNode) return;
    const parentRels = data.tree.nodes
      .flatMap((n: any) => n.relationsAsSource)
      .filter((r: any) => r.targetId === sourceNode.id && r.type === "PARENT_CHILD");

    if (parentRels.length === 0) {
      toast.error(
        m.cannot_add_sibling_error()
      );
      return;
    }

    isEditingMember = false;
    editingNodeId = null;
    pendingRelation = { type: "SIBLING", sourceId: sourceNode.id };
    showMemberModal = true;
  }

  function openQuickAddParent(sourceNode: any, gender: "MALE" | "FEMALE") {
    if (!sourceNode) return;
    isEditingMember = false;
    editingNodeId = null;
    pendingRelation = { type: "PARENT", sourceId: sourceNode.id, gender };
    showMemberModal = true;
  }

  function centerOnNode(nodeId: string) {
    const node = layout.renderNodes.find((n) => n.id === nodeId);
    if (!node || !canvasContainerElement) return;

    const rect = canvasContainerElement.getBoundingClientRect();

    if (scale < 0.5 || scale > 1.5) {
      scale = 0.9;
    }

    panX = rect.width / 2 - (node.x + node.width / 2) * scale;
    panY = rect.height / 2 - (node.y + node.height / 2) * scale;
  }

  async function handleDeleteMember(id: string) {
    if (
      !confirm(
        m.delete_member_confirm(),
      )
    ) {
      return;
    }

    try {
      const { error } = await client.api.workspace.nodes({ id }).delete();

      if (error) {
        throw new Error((error.value as string) || m.delete_member_failed());
      }

      toast.success(m.delete_member_success());
      selectedNodeId = null;
      await invalidateAll();
    } catch (err) {
      toast.error(m.delete_member_failed());
      console.error(err);
    }
  }

  // Relations Form
  function openAddRelationship(sourceId: string) {
    relSourceId = sourceId;
    relTargetId = "";
    relType = "PARENT_CHILD";
    showRelationshipModal = true;
  }

  async function handleDeleteRelationship(edgeId: string) {
    if (
      !confirm(m.delete_relationship_confirm())
    ) {
      return;
    }
    try {
      const { error } = await client.api.workspace
        .edges({ id: edgeId })
        .delete();
      if (error)
        throw new Error(
          (error.value as string) || m.delete_relationship_failed(),
        );
      toast.success(m.delete_relationship_success());
      await invalidateAll();
    } catch (err) {
      toast.error(m.delete_relationship_failed());
      console.error(err);
    }
  }

  $effect(() => {
    setTimeout(fitView, 100);
  });
</script>

<div class="flex-1 flex min-h-0 relative overflow-hidden">
  <!-- Main Zoomable Panning Canvas -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
  <div
    bind:this={canvasContainerElement}
    class="flex-1 min-h-0 bg-muted/30 select-none outline-none relative overflow-hidden cursor-grab active:cursor-grabbing"
    onmousedown={handleMouseDown}
    onmousemove={handleMouseMove}
    onmouseup={handleMouseUp}
    onmouseleave={handleMouseUp}
    onwheel={handleWheel}
    tabindex="0"
  >
    <!-- Inner Canvas with Pan and Zoom Transforms -->
    <div
      class="absolute inset-0 origin-top-left"
      style="transform: translate({panX}px, {panY}px) scale({scale});"
    >
      <!-- SVG Connecting Edges -->
      <svg
        class="absolute overflow-visible w-full h-full pointer-events-none"
      >
        <defs>
          <marker
            id="arrow"
            viewBox="0 0 10 10"
            refX="5"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#94a3b8" />
          </marker>
        </defs>
        {#each layout.renderEdges as edge}
          <path
            d={edge.path}
            fill="none"
            stroke={edge.type === "SPOUSE" ? "#f43f5e" : "#94a3b8"}
            stroke-width={edge.type === "SPOUSE" ? 3 : 2}
            stroke-dasharray={edge.type === "SPOUSE" ? "5,5" : "none"}
            class="transition-all duration-300 pointer-events-auto hover:stroke-primary hover:stroke-[3px] cursor-pointer"
          >
            <title>{edge.type === 'SPOUSE' ? m.arrow_spouse_link() : m.arrow_parent_child_link()}</title>
          </path>
        {/each}
      </svg>

      <!-- Member Node Cards -->
      {#each layout.renderNodes as node}
        {@const hasChildren = data.tree.nodes.some((child: any) =>
          child.relationsAsTarget.some(
            (rel: any) =>
              rel.sourceId === node.id && rel.type === "PARENT_CHILD",
          ),
        )}
        {@const isCollapsed = collapsedNodes.has(node.id)}
        {@const hasParents = data.tree.nodes.some((parent: any) =>
          parent.relationsAsSource.some(
            (rel: any) =>
              rel.targetId === node.id && rel.type === "PARENT_CHILD",
          ),
        )}
        {@const isAncestorsCollapsed = collapsedAncestors.has(node.id)}

        <div
          style="left: {node.x}px; top: {node.y}px; width: {node.width}px; height: {node.height}px;"
          class="absolute pointer-events-auto node-card transition-all duration-200 group"
        >
          {#if hasParents}
            <button
              onclick={(e) => {
                e.stopPropagation();
                toggleCollapseAncestors(node.id);
              }}
              class="absolute -top-3 left-1/2 -translate-x-1/2 w-6 h-6 rounded-full bg-background border shadow-md flex items-center justify-center cursor-pointer hover:bg-muted hover:scale-110 transition-all z-20 transition-opacity duration-200 {isAncestorsCollapsed
                ? 'opacity-100'
                : 'opacity-0 group-hover:opacity-100'}"
              title={isAncestorsCollapsed
                ? m.expand_ancestors()
                : m.collapse_ancestors()}
            >
              {#if isAncestorsCollapsed}
                <ChevronUp class="h-3.5 w-3.5 text-emerald-600 font-bold" />
              {:else}
                <ChevronDown class="h-3.5 w-3.5 text-rose-600 font-bold" />
              {/if}
            </button>
          {/if}

          <!-- Hide node button (top-right of card on hover) -->
          <button
            onclick={(e) => {
              e.stopPropagation();
              hideNode(node.id);
            }}
            class="absolute -top-3 -right-3 w-6 h-6 rounded-full bg-background border shadow-md flex items-center justify-center cursor-pointer hover:bg-rose-50 hover:scale-110 transition-all z-20 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
            title={m.hide_member_subtree()}
          >
            <EyeOff class="h-3 w-3 text-rose-500 font-bold" />
          </button>

          <Card
            onclick={() => (selectedNodeId = node.id)}
            class="w-full h-full p-2.5 flex flex-col justify-between cursor-pointer border-t-4 border-l-2 border-r-2 border-b-2 hover:shadow-lg transition-all duration-200
              {selectedNodeId === node.id
              ? 'border-primary/90 bg-primary/5 shadow-md'
              : 'bg-background'}
              {node.data.gender === 'MALE'
              ? 'border-t-blue-500'
              : 'border-t-rose-500'}
              {node.data.deathDate ? 'opacity-85' : ''}
            "
          >
            <div>
              <div class="flex items-center justify-between gap-1">
                <span
                  class="text-xs text-muted-foreground truncate font-medium"
                >
                  {node.data.lastName || ""}
                  {node.data.firstName || ""}
                </span>
                {#if node.data.deathDate}
                  <span
                    class="text-[10px] font-semibold text-zinc-500 border border-zinc-400/30 px-1 rounded uppercase"
                  >
                    {m.deceased()}
                  </span>
                {/if}
              </div>
              <h4
                class="font-serif font-bold text-sm line-clamp-1 group-hover:text-primary"
              >
                {node.data.firstName}
              </h4>

              <div
                class="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t border-muted/50"
              >
                <span>
                  {#if node.data.deathDate}
                    {node.data.birthDate
                      ? new Date(node.data.birthDate).getFullYear()
                      : "????"} - {new Date(
                      node.data.deathDate,
                    ).getFullYear()}
                  {:else}
                    {node.data.birthDate
                      ? new Date(node.data.birthDate).getFullYear()
                      : "????"}
                  {/if}
                </span>
              </div>
            </div>
          </Card>

          {#if hasChildren}
            <button
              onclick={(e) => {
                e.stopPropagation();
                toggleCollapse(node.id);
              }}
              class="absolute -bottom-3 left-1/2 -translate-x-1/2 w-6 h-6 rounded-full bg-background border shadow-md flex items-center justify-center cursor-pointer hover:bg-muted hover:scale-110 transition-all z-20 transition-opacity duration-200 {isCollapsed
                ? 'opacity-100'
                : 'opacity-0 group-hover:opacity-100'}"
              title={isCollapsed ? m.expand_branch() : m.collapse_branch()}
            >
              {#if isCollapsed}
                <ChevronDown
                  class="h-3.5 w-3.5 text-emerald-600 font-bold"
                />
              {:else}
                <ChevronUp class="h-3.5 w-3.5 text-rose-600 font-bold" />
              {/if}
            </button>
          {/if}
        </div>
      {/each}
    </div>
  </div>

  <!-- Floating Canvas Navigation Controls -->
  <div
    class="absolute bottom-6 left-6 flex flex-col gap-2 z-10 bg-background/80 backdrop-blur-md p-2 rounded-xl shadow-lg border"
  >
    <Button
      variant="ghost"
      size="icon"
      onclick={zoomIn}
      class="h-9 w-9 rounded-lg"
      title={m.zoom_in()}
    >
      <ZoomIn class="h-4 w-4" />
    </Button>
    <Button
      variant="ghost"
      size="icon"
      onclick={zoomOut}
      class="h-9 w-9 rounded-lg"
      title={m.zoom_out()}
    >
      <ZoomOut class="h-4 w-4" />
    </Button>
    <Button
      variant="ghost"
      size="icon"
      onclick={fitView}
      class="h-9 w-9 rounded-lg"
      title={m.fit_view()}
    >
      <Maximize2 class="h-4 w-4" />
    </Button>
  </div>

  <!-- Floating Canvas Toolbar Controls (Top Left) -->
  <div class="absolute top-6 left-6 z-10 flex items-center gap-3">
    {#if data.role !== "VIEWER"}
      <Button
        onclick={openAddMember}
        class="shadow-lg flex items-center gap-2"
      >
        <Plus class="h-4 w-4" />
        <span>{m.add_member()}</span>
      </Button>
    {/if}

    {#if focusedRootNodeId}
      {@const rn = data.tree.nodes.find(
        (node: any) => node.id === focusedRootNodeId,
      )}
      {#if rn}
        <Button
          variant="outline"
          class="shadow-lg flex items-center gap-2 border-emerald-300 hover:border-emerald-500 bg-background"
          onclick={resetFocusSubtree}
        >
          <Maximize2 class="h-4 w-4 text-emerald-600" />
          <span>{m.root_focused({ name: `${rn.lastName || ""} ${rn.firstName}` })}</span>
          <X class="h-3.5 w-3.5 text-muted-foreground ml-1" />
        </Button>
      {/if}
    {/if}

    {#if cognatesRootNodeId}
      {@const cn = data.tree.nodes.find(
        (node: any) => node.id === cognatesRootNodeId,
      )}
      {#if cn}
        <Button
          variant="outline"
          class="shadow-lg flex items-center gap-2 border-blue-300 hover:border-blue-500 bg-background"
          onclick={resetCognatesRootNode}
        >
          <Users class="h-4 w-4 text-blue-600" />
          <span>{m.relatives_focused({ name: `${cn.lastName || ""} ${cn.firstName}` })}</span>
          <X class="h-3.5 w-3.5 text-muted-foreground ml-1" />
        </Button>
      {/if}
    {/if}

    {#if userHiddenNodes.size > 0}
      <Button
        variant="outline"
        class="shadow-lg flex items-center gap-2 border-dashed border-rose-300 hover:border-rose-500 bg-background"
        onclick={() => {
          selectedNodeId = null;
          toast.info(
            m.select_hidden_unhide_toast(),
          );
        }}
      >
        <EyeOff class="h-4 w-4 text-rose-500" />
        <span>{m.hidden_members_btn({ count: userHiddenNodes.size })}</span>
      </Button>
    {/if}
  </div>

  <!-- Interactive Right Sidebar (Selected Profile, Details, Timeline & Kinship) -->
  <div
    class="w-96 border-l bg-background flex flex-col min-h-0 z-10 sidebar-container"
  >
    {#if !selectedNode}
      <!-- Empty Sidebar state -->
      <div class="flex-1 flex flex-col min-h-0">
        <div
          class="flex-1 flex flex-col items-center justify-center p-8 text-center text-muted-foreground"
        >
          <Info class="h-8 w-8 text-muted-foreground/50 mb-3" />
          <h4 class="font-semibold text-sm">{m.select_member_prompt_title()}</h4>
          <p class="text-xs max-w-xs mt-1">
            {m.select_member_prompt_desc()}
          </p>
        </div>

        {#if userHiddenNodes.size > 0}
          <div
            class="border-t p-6 max-h-[350px] flex flex-col min-h-0 bg-muted/20"
          >
            <h4 class="font-semibold text-sm mb-3 flex items-center gap-2">
              <EyeOff class="h-4 w-4 text-rose-500" />
              {m.hidden_members_sidebar_title({ count: userHiddenNodes.size })}
            </h4>
            <div class="overflow-y-auto space-y-2 flex-1 pr-1">
              {#each Array.from(userHiddenNodes) as nodeId}
                {@const n = data.tree.nodes.find(
                  (node: any) => node.id === nodeId,
                )}
                {#if n}
                  <div
                    class="flex items-center justify-between bg-background p-2 rounded-lg border text-xs shadow-sm"
                  >
                    <span class="font-medium truncate max-w-[180px]">
                      {n.lastName || ""}
                      {n.firstName}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      class="h-6 w-6 hover:bg-muted rounded-full"
                      onclick={() => unhideNode(n.id)}
                      title={m.unhide_member_tooltip()}
                    >
                      <Eye class="h-3.5 w-3.5 text-emerald-600" />
                    </Button>
                  </div>
                {/if}
              {/each}
            </div>
          </div>
        {/if}
      </div>
    {:else}
      <!-- Node Details & Profile Tab -->
      <div class="p-6 border-b flex items-start justify-between gap-4">
        <div>
          <span
            class="text-xs uppercase tracking-wider font-semibold text-primary"
          >
            {m.gender_profile({ gender: selectedNode.gender })}
          </span>
          <h3 class="font-serif text-2xl font-bold mt-1">
            {selectedNode.lastName || ""}
            {selectedNode.firstName}
          </h3>
          {#if selectedNode.jobPosition || selectedNode.major}
            <p
              class="text-xs text-muted-foreground flex items-center gap-1 mt-1"
            >
              <Briefcase class="h-3 w-3" />
              <span>
                {selectedNode.jobPosition || m.job_default()}{selectedNode.major
                  ? ` • ${selectedNode.major}`
                  : ""}
              </span>
            </p>
          {/if}
          <div class="mt-3 flex flex-wrap gap-2">
            <Button
              variant={cognatesRootNodeId === selectedNode.id
                ? "secondary"
                : "outline"}
              size="xs"
              class="h-7 text-xs flex items-center gap-1 px-3 rounded-full"
              onclick={() => {
                if (cognatesRootNodeId === selectedNode.id) {
                  resetCognatesRootNode();
                } else {
                  setCognatesRootNode(selectedNode.id);
                }
              }}
            >
              <Users class="h-3.5 w-3.5" />
              <span>
                {cognatesRootNodeId === selectedNode.id
                  ? m.show_all_btn()
                  : m.blood_relatives_btn()}
              </span>
            </Button>

            <Button
              variant={focusedRootNodeId === selectedNode.id
                ? "secondary"
                : "outline"}
              size="xs"
              class="h-7 text-xs flex items-center gap-1 px-3 rounded-full"
              onclick={() => {
                if (focusedRootNodeId === selectedNode.id) {
                  resetFocusSubtree();
                } else {
                  focusSubtree(selectedNode.id);
                }
              }}
            >
              <Maximize2 class="h-3.5 w-3.5" />
              <span>
                {focusedRootNodeId === selectedNode.id
                  ? m.full_tree_btn()
                  : m.make_root_btn()}
              </span>
            </Button>

            <Button
              variant="outline"
              size="xs"
              class="h-7 text-xs flex items-center gap-1 px-3 rounded-full hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200"
              onclick={() => hideNode(selectedNode.id)}
            >
              <EyeOff class="h-3.5 w-3.5" />
              <span>{m.hide_member_btn()}</span>
            </Button>
          </div>
        </div>

        <button
          onclick={() => (selectedNodeId = null)}
          class="text-muted-foreground hover:text-foreground"
        >
          <X class="h-5 w-5" />
        </button>
      </div>

      <!-- Tabs for Member details: Details, Relations, Kinship -->
      <div class="flex-1 overflow-y-auto p-6 space-y-8">
        <!-- Biography Card & Contact -->
        <div class="space-y-4">
          <div class="flex justify-between items-center">
            <h4 class="font-serif font-bold text-lg">
              {m.personal_information()}
            </h4>
            {#if data.role !== "VIEWER"}
              <div class="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  class="h-7 text-xs"
                  onclick={() => openEditMember(selectedNode)}
                >
                  {m.edit()}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  class="h-7 text-xs text-destructive hover:bg-destructive/10"
                  onclick={() => handleDeleteMember(selectedNode.id)}
                >
                  {m.delete()}
                </Button>
              </div>
            {/if}
          </div>

          <div
            class="grid grid-cols-2 gap-4 bg-muted/40 p-4 rounded-xl text-xs space-y-0.5"
          >
            <div>
              <span class="text-muted-foreground block">{m.birth_date()}</span>
              <span class="font-medium"
                >{selectedNode.birthDate
                  ? new Date(selectedNode.birthDate).toLocaleDateString()
                  : m.unknown()}</span
              >
            </div>
            {#if selectedNode.lunarBirthDate}
              <div>
                <span class="text-muted-foreground block"
                  >{m.lunar_birth_date()}</span
                >
                <span class="font-medium"
                  >{selectedNode.lunarBirthDate}</span
                >
              </div>
            {/if}
            {#if selectedNode.deathDate}
              <div>
                <span class="text-muted-foreground block"
                  >{m.deceased_date()}</span
                >
                <span class="font-medium text-rose-600"
                  >{new Date(
                    selectedNode.deathDate,
                  ).toLocaleDateString()}</span
                >
              </div>
            {/if}
            {#if selectedNode.lunarDeathDate}
              <div>
                <span class="text-muted-foreground block"
                  >{m.lunar_death_date()}</span
                >
                <span class="font-medium text-rose-600"
                  >{selectedNode.lunarDeathDate}</span
                >
              </div>
            {/if}
            {#if selectedNode.phone}
              <div
                class="col-span-2 flex items-center gap-1.5 mt-2 pt-2 border-t border-muted"
              >
                <Phone class="h-3 w-3 text-muted-foreground" />
                <span>{selectedNode.phone}</span>
              </div>
            {/if}
            {#if selectedNode.email}
              <div class="col-span-2 flex items-center gap-1.5">
                <Mail class="h-3 w-3 text-muted-foreground" />
                <span class="truncate">{selectedNode.email}</span>
              </div>
            {/if}
          </div>
        </div>

        <!-- Quick Add Relative -->
        {#if data.role !== "VIEWER"}
          <div class="space-y-3 pt-4 border-t">
            <h4
              class="font-serif font-bold text-xs uppercase tracking-wider text-muted-foreground"
            >
              {m.quick_add_relative()}
            </h4>
            <div class="grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                size="sm"
                class="h-8 text-xs flex items-center justify-start gap-1.5 px-3 border border-dashed border-primary/40 hover:border-primary text-primary bg-primary/5 hover:bg-primary/10"
                onclick={() => openQuickAddSpouse(selectedNode)}
              >
                <Plus class="h-3.5 w-3.5" />
                <span>{m.spouse_relation()}</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                class="h-8 text-xs flex items-center justify-start gap-1.5 px-3 border border-dashed border-primary/40 hover:border-primary text-primary bg-primary/5 hover:bg-primary/10"
                onclick={() => openQuickAddChild(selectedNode)}
              >
                <Plus class="h-3.5 w-3.5" />
                <span>{m.child_relation()}</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                class="h-8 text-xs flex items-center justify-start gap-1.5 px-3 border border-dashed border-primary/40 hover:border-primary text-primary bg-primary/5 hover:bg-primary/10 col-span-2"
                onclick={() => openQuickAddSibling(selectedNode)}
              >
                <Plus class="h-3.5 w-3.5" />
                <span>{m.sibling_relation()}</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                class="h-8 text-xs flex items-center justify-start gap-1.5 px-3 border border-dashed border-muted-foreground/30 hover:border-muted-foreground text-muted-foreground hover:bg-muted/40"
                onclick={() => openQuickAddParent(selectedNode, "MALE")}
              >
                <Plus class="h-3.5 w-3.5" />
                <span>{m.parent_father()}</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                class="h-8 text-xs flex items-center justify-start gap-1.5 px-3 border border-dashed border-muted-foreground/30 hover:border-muted-foreground text-muted-foreground hover:bg-muted/40"
                onclick={() => openQuickAddParent(selectedNode, "FEMALE")}
              >
                <Plus class="h-3.5 w-3.5" />
                <span>{m.parent_mother()}</span>
              </Button>
            </div>
          </div>
        {/if}

        <!-- Custom Field Values -->
        {#if selectedNode.customValues && selectedNode.customValues.length > 0}
          <div class="space-y-3">
            <h4
              class="font-serif font-bold text-sm uppercase tracking-wider text-muted-foreground"
            >
              {m.custom_field_attributes()}
            </h4>
            <div class="space-y-2">
              {#each selectedNode.customValues as cv}
                {@const definition = data.tree.fields.find(
                  (f: any) => f.id === cv.fieldId,
                )}
                {#if definition}
                  <div
                    class="flex justify-between items-center text-xs py-1.5 border-b border-muted"
                  >
                    <span class="text-muted-foreground"
                      >{definition.name}</span
                    >
                    <span class="font-medium">{cv.value}</span>
                  </div>
                {/if}
              {/each}
            </div>
          </div>
        {/if}

        <!-- Direct Relationships Lists -->
        <div class="space-y-4">
          <div class="flex justify-between items-center">
            <h4 class="font-serif font-bold text-lg">{m.relationships()}</h4>
            {#if data.role !== "VIEWER"}
              <Button
                variant="outline"
                size="sm"
                onclick={() => openAddRelationship(selectedNode.id)}
                class="h-7 text-xs flex items-center gap-1"
              >
                <UserPlus class="h-3 w-3" />
                <span>{m.link_relation()}</span>
              </Button>
            {/if}
          </div>

          <!-- List Source Relations (e.g. Spouses, Children) -->
          {#if selectedSourceRels.length === 0 && selectedTargetRels.length === 0}
            <p class="text-xs text-muted-foreground italic">
              {m.no_relations_mapped()}
            </p>
          {:else}
            <div class="space-y-2 text-xs">
              <!-- Spouses -->
              {#each selectedSpouses as { relId, spouseNode }}
                <div
                  class="flex items-center justify-between p-2 rounded bg-muted/30"
                >
                  <span
                    >{@html m.relation_label_spouse({ name: `<strong>${spouseNode.lastName || ""} ${spouseNode.firstName}</strong>` })}</span
                  >
                  {#if data.role !== "VIEWER"}
                    <button
                      onclick={() => handleDeleteRelationship(relId)}
                      class="text-destructive hover:text-red-500"
                    >
                      <X class="h-3.5 w-3.5" />
                    </button>
                  {/if}
                </div>
              {/each}

              <!-- Parents (relations where selected node is Target and type is PARENT_CHILD) -->
              {#each selectedTargetRels.filter((r: any) => r.type === "PARENT_CHILD") as rel}
                {@const parent = data.tree.nodes.find(
                  (n: any) => n.id === rel.sourceId,
                )}
                {#if parent}
                  <div
                    class="flex items-center justify-between p-2 rounded bg-muted/30"
                  >
                    <span
                      >{@html m.relation_label_parent({ name: `<strong>${parent.lastName || ""} ${parent.firstName}</strong>` })}</span
                    >
                    {#if data.role !== "VIEWER"}
                      <button
                        onclick={() => handleDeleteRelationship(rel.id)}
                        class="text-destructive hover:text-red-500"
                      >
                        <X class="h-3.5 w-3.5" />
                      </button>
                    {/if}
                  </div>
                {/if}
              {/each}

              <!-- Children (relations where selected node is Source and type is PARENT_CHILD) -->
              {#each selectedSourceRels.filter((r: any) => r.type === "PARENT_CHILD") as rel}
                {@const child = data.tree.nodes.find(
                  (n: any) => n.id === rel.targetId,
                )}
                {#if child}
                  <div
                    class="flex items-center justify-between p-2 rounded bg-muted/30"
                  >
                    <span
                      >{@html m.relation_label_child({ name: `<strong>${child.lastName || ""} ${child.firstName}</strong>` })}</span
                    >
                    {#if data.role !== "VIEWER"}
                      <button
                        onclick={() => handleDeleteRelationship(rel.id)}
                        class="text-destructive hover:text-red-500"
                      >
                        <X class="h-3.5 w-3.5" />
                      </button>
                    {/if}
                  </div>
                {/if}
              {/each}
            </div>
          {/if}
        </div>

        <!-- Kinship Calculator widget -->
        <div class="space-y-4 pt-6 border-t">
          <h4
            class="font-serif font-bold text-lg flex items-center gap-1.5"
          >
            <HelpCircle class="h-4 w-4 text-primary" />
            <span>{m.kinship_calculator()}</span>
          </h4>

          <div class="space-y-3">
            <Label for="kinship-target" class="text-xs"
              >{m.compare_relationship_to()}</Label
            >
            <Combobox
              id="kinship-target"
              bind:value={kinshipTargetId}
              options={data.tree.nodes
                .filter((n: any) => n.id !== selectedNode.id)
                .map((n: any) => ({
                  value: n.id,
                  label: `${n.lastName || ""} ${n.firstName}`,
                }))}
              placeholder={m.choose_family_member_placeholder()}
              searchPlaceholder={m.search_family_member_placeholder()}
            />

            {#if kinshipCalculated}
              <div
                class="bg-primary/5 border border-primary/20 p-4 rounded-xl mt-2 animate-in fade-in slide-in-from-top-1 duration-200"
              >
                <p
                  class="text-xs text-muted-foreground uppercase tracking-wider font-semibold"
                >
                  {m.calculated_relation()}
                </p>
                <h5 class="text-base font-bold text-primary mt-1">
                  {kinshipCalculated.termVi}
                </h5>
                <p class="text-xs text-muted-foreground italic mt-0.5">
                  ({kinshipCalculated.termEn})
                </p>
              </div>
            {/if}
          </div>
        </div>

        <!-- Dynamic Biography Timeline -->
        <div class="space-y-4 pt-6 border-t">
          <h4 class="font-serif font-bold text-lg">{m.life_timeline()}</h4>
          {#if selectedTimeline.length === 0}
            <p class="text-xs text-muted-foreground italic">
              {m.no_timeline_events()}
            </p>
          {:else}
            <div
              class="relative border-l border-muted pl-4 ml-2 space-y-4 text-xs"
            >
              {#each selectedTimeline as event}
                <div class="relative">
                  <div
                    class="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full border border-primary bg-background"
                  ></div>
                  <span class="font-bold text-primary block"
                    >{event.year}</span
                  >
                  <span class="text-muted-foreground">{event.text}</span>
                </div>
              {/each}
            </div>
          {/if}
        </div>
      </div>
    {/if}
  </div>
</div>

<!-- MEMBER MODAL (ADD / EDIT) -->
<MemberModal
  bind:show={showMemberModal}
  bind:isEditingMember
  bind:editingNodeId
  bind:pendingRelation
  {data}
/>

<!-- RELATIONSHIP MODAL -->
<RelationshipModal
  bind:show={showRelationshipModal}
  bind:relSourceId
  bind:relType
  bind:relTargetId
  {data}
/>
