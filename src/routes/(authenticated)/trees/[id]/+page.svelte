<script lang="ts">
  import { invalidateAll } from "$app/navigation";
  import { client } from "$lib";
  import { Button } from "$lib/components/ui/button";
  import { Card } from "$lib/components/ui/card";
  import { Combobox } from "$lib/components/ui/combobox";
  import { DatePicker } from "$lib/components/ui/date-picker";
  import { Input } from "$lib/components/ui/input";
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
    Trash2,
    UserPlus,
    Users,
    X,
    ZoomIn,
    ZoomOut,
  } from "@lucide/svelte";
  import { toast } from "svelte-sonner";

  let { data } = $props();

  // Active Workspace Tab
  let activeTab = $state<"tree" | "members" | "fields">("tree");

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

  // Collaborator States
  let inviteEmailOrUsername = $state("");
  let inviteRole = $state<"EDITOR" | "VIEWER">("VIEWER");
  let isInviting = $state(false);

  // Custom Field States
  let newFieldName = $state("");
  let newFieldType = $state<"STRING" | "NUMBER" | "DATE" | "BOOLEAN">("STRING");
  let isCreatingField = $state(false);

  // Form Node inputs
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

  // Kinship target node selection
  let kinshipTargetId = $state<string>("");

  // Derived tree layout
  const layout = $derived.by(() => {
    // Filter out nodes that are descendants of collapsed nodes
    // Helper to find all descendants of a node ID
    const hiddenNodes = new Set<string>();
    const gatherDescendants = (parentId: string) => {
      const children = data.tree.nodes.filter((n) =>
        data.tree.nodes.some(
          (possibleParent) =>
            possibleParent.id === parentId &&
            possibleParent.relationsAsSource.some(
              (rel) => rel.targetId === n.id && rel.type === "PARENT_CHILD",
            ),
        ),
      );
      for (const child of children) {
        hiddenNodes.add(child.id);
        gatherDescendants(child.id);
      }
    };

    const gatherAncestors = (childId: string) => {
      const parents = data.tree.nodes.filter((n) =>
        data.tree.nodes.some(
          (possibleChild) =>
            possibleChild.id === childId &&
            n.relationsAsSource.some(
              (rel) =>
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
          .flatMap((n) => n.relationsAsSource)
          .filter(
            (e) =>
              e.type === "SPOUSE" &&
              (e.sourceId === nodeId || e.targetId === nodeId),
          )
          .map((e) => (e.sourceId === nodeId ? e.targetId : e.sourceId));
        for (const spouseId of spouses) {
          allowedBySubtreeFocus.add(spouseId);
        }

        // Add children
        const children = data.tree.nodes.filter((n) =>
          data.tree.nodes.some(
            (possibleParent) =>
              possibleParent.id === nodeId &&
              possibleParent.relationsAsSource.some(
                (rel) => rel.targetId === n.id && rel.type === "PARENT_CHILD",
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
      // 1. Gather all ancestors of cognatesRootNodeId (including cognatesRootNodeId)
      const ancestors = new Set<string>();
      const queue = [cognatesRootNodeId];
      ancestors.add(cognatesRootNodeId);

      while (queue.length > 0) {
        const currId = queue.shift()!;

        // Find parents of currId
        const parents = data.tree.nodes.filter((parent) =>
          parent.relationsAsSource.some(
            (rel) => rel.targetId === currId && rel.type === "PARENT_CHILD",
          ),
        );
        for (const parent of parents) {
          if (!ancestors.has(parent.id)) {
            ancestors.add(parent.id);
            queue.push(parent.id);
          }
        }
      }

      // 2. Gather all descendants of all ancestors
      const descQueue = Array.from(ancestors);
      for (const id of descQueue) {
        cognates.add(id);
      }

      while (descQueue.length > 0) {
        const currId = descQueue.shift()!;

        // Find children of currId
        const children = data.tree.nodes.filter((child) =>
          child.relationsAsTarget.some(
            (rel) => rel.sourceId === currId && rel.type === "PARENT_CHILD",
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
        const parents = data.tree.nodes.filter((parent) =>
          parent.relationsAsSource.some(
            (rel) => rel.targetId === n.id && rel.type === "PARENT_CHILD",
          ),
        );

        // n is hidden if it has parents and ALL of its parents are hidden
        if (
          parents.length > 0 &&
          parents.every((p) => fullyHiddenNodes.has(p.id))
        ) {
          fullyHiddenNodes.add(n.id);
          changed = true;
        }
      }
    }

    const filteredNodes = data.tree.nodes.filter((n) => {
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
    const nodeIds = new Set(filteredNodes.map((n) => n.id));
    const filteredEdges = (
      data.tree.nodes.flatMap((n) => n.relationsAsSource) as TreeLayoutEdge[]
    ).filter((e) => nodeIds.has(e.sourceId) && nodeIds.has(e.targetId));

    // Standardize nodes for layout algorithm
    const standardNodes: TreeLayoutNode[] = filteredNodes.map((n) => ({
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
    data.tree.nodes.find((n) => n.id === selectedNodeId),
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
      .flatMap((n) => n.relationsAsSource)
      .filter(
        (e) =>
          e.type === "SPOUSE" &&
          (e.sourceId === selectedNode.id || e.targetId === selectedNode.id),
      );
    return spouseEdges
      .map((rel) => {
        const spouseId =
          rel.sourceId === selectedNode.id ? rel.targetId : rel.sourceId;
        const spouseNode = data.tree.nodes.find((n) => n.id === spouseId);
        return { relId: rel.id, spouseNode };
      })
      .filter((item) => item.spouseNode !== undefined) as {
      relId: string;
      spouseNode: typeof selectedNode;
    }[];
  });

  const treeMembers = $derived(data.tree.members || []);

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
        text: `Born${selectedNode.lunarBirthDate ? ` (Lunar: ${selectedNode.lunarBirthDate})` : ""}`,
        date: birth.toLocaleDateString(),
        type: "birth",
      });
    }

    // Spouses
    const spouseEdges = data.tree.nodes
      .flatMap((n) => n.relationsAsSource)
      .filter(
        (e) =>
          e.type === "SPOUSE" &&
          (e.sourceId === selectedNode.id || e.targetId === selectedNode.id),
      );
    for (const edge of spouseEdges) {
      const partnerId =
        edge.sourceId === selectedNode.id ? edge.targetId : edge.sourceId;
      const partner = data.tree.nodes.find((n) => n.id === partnerId);
      if (partner) {
        events.push({
          year:
            (edge.metadata as any)?.year ||
            new Date(partner.birthDate).getFullYear(),
          text: `Married ${partner.lastName || ""} ${partner.firstName}`,
          type: "spouse",
        });
      }
    }

    // Children
    const childrenEdges = data.tree.nodes
      .flatMap((n) => n.relationsAsSource)
      .filter(
        (e) => e.type === "PARENT_CHILD" && e.sourceId === selectedNode.id,
      );
    for (const edge of childrenEdges) {
      const child = data.tree.nodes.find((n) => n.id === edge.targetId);
      if (child) {
        events.push({
          year: new Date(child.birthDate).getFullYear(),
          text: `Had a child: ${child.lastName || ""} ${child.firstName}`,
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
        text: `Passed away${selectedNode.lunarDeathDate ? ` (Lunar: ${selectedNode.lunarDeathDate})` : ""}`,
        date: death.toLocaleDateString(),
        type: "death",
      });
    }

    return events.sort((a, b) => a.year - b.year);
  });

  // Derived kinship calculation
  const kinshipCalculated = $derived.by(() => {
    if (!selectedNodeId || !kinshipTargetId) return null;
    // Map edges cleanly
    const allEdges: TreeLayoutEdge[] = data.tree.nodes
      .flatMap((n) => n.relationsAsSource)
      .map((e) => ({
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

    // Ignore drags that start on node cards or interactive components
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

    // Perform zoom centered on mouse coordinates
    if (canvasContainerElement) {
      const rect = canvasContainerElement.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      // Adjust pan coordinates so the mouse pointer remains on the same canvas coordinate
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

    // Find bounding box of nodes
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
      scale = Math.max(0.3, Math.min(scaleX, scaleY, 1.2)); // Keep scale inside reasonable bounds

      panX = (rect.width - contentWidth * scale) / 2 - minX * scale;
      panY = (rect.y - contentHeight * scale) / 4 - minY * scale + 64; // adjust margin
    }
  }

  // Branch Collapsing
  function toggleCollapse(nodeId: string) {
    if (collapsedNodes.has(nodeId)) {
      collapsedNodes.delete(nodeId);
    } else {
      collapsedNodes.add(nodeId);
    }
    collapsedNodes = new Set(collapsedNodes); // Trigger reactivity
  }

  function toggleCollapseAncestors(nodeId: string) {
    if (collapsedAncestors.has(nodeId)) {
      collapsedAncestors.delete(nodeId);
    } else {
      collapsedAncestors.add(nodeId);
    }
    collapsedAncestors = new Set(collapsedAncestors); // Trigger reactivity

    // Center on this node after layout recalculation
    setTimeout(() => {
      centerOnNode(nodeId);
    }, 50);
  }

  function hideNode(nodeId: string) {
    userHiddenNodes.add(nodeId);
    userHiddenNodes = new Set(userHiddenNodes); // Trigger reactivity
    if (selectedNodeId === nodeId) {
      selectedNodeId = null;
    }
    toast.success("Member hidden from view");
  }

  function unhideNode(nodeId: string) {
    userHiddenNodes.delete(nodeId);
    userHiddenNodes = new Set(userHiddenNodes); // Trigger reactivity
    toast.success("Member restored to view");
  }

  function focusSubtree(nodeId: string) {
    focusedRootNodeId = nodeId;
    // Center on this node after layout recalculation
    setTimeout(() => {
      centerOnNode(nodeId);
    }, 50);
  }

  function resetFocusSubtree() {
    focusedRootNodeId = null;
  }

  function setCognatesRootNode(nodeId: string) {
    cognatesRootNodeId = nodeId;
    // Center on this node after layout recalculation
    setTimeout(() => {
      centerOnNode(nodeId);
    }, 50);
  }

  function resetCognatesRootNode() {
    cognatesRootNodeId = null;
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

  // Form helpers
  function openAddMember() {
    isEditingMember = false;
    editingNodeId = null;
    nodeForm = {
      firstName: "",
      lastName: "",
      gender: "MALE",
      birthDate: "",
      deathDate: "",
      lunarBirthDate: "",
      lunarDeathDate: "",
      phone: "",
      email: "",
      major: "",
      jobPosition: "",
      customFields: data.tree.fields.map((f) => ({
        fieldId: f.id,
        value: "",
      })),
    };
    showMemberModal = true;
  }

  function openEditMember(node: typeof selectedNode) {
    if (!node) return;
    isEditingMember = true;
    editingNodeId = node.id;
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
      customFields: data.tree.fields.map((f) => {
        const existingVal = node.customValues.find((cv) => cv.fieldId === f.id);
        return { fieldId: f.id, value: existingVal ? existingVal.value : "" };
      }),
    };
    showMemberModal = true;
  }

  function openQuickAddSpouse(sourceNode: typeof selectedNode) {
    if (!sourceNode) return;
    isEditingMember = false;
    editingNodeId = null;
    pendingRelation = { type: "SPOUSE", sourceId: sourceNode.id };

    // Default spouse gender: opposite of selected node
    const defaultGender = sourceNode.gender === "MALE" ? "FEMALE" : "MALE";

    nodeForm = {
      firstName: "",
      lastName: sourceNode.lastName || "",
      gender: defaultGender,
      birthDate: "",
      deathDate: "",
      lunarBirthDate: "",
      lunarDeathDate: "",
      phone: "",
      email: "",
      major: "",
      jobPosition: "",
      customFields: data.tree.fields.map((f) => ({
        fieldId: f.id,
        value: "",
      })),
    };
    showMemberModal = true;
  }

  function openQuickAddChild(sourceNode: typeof selectedNode) {
    if (!sourceNode) return;
    isEditingMember = false;
    editingNodeId = null;
    pendingRelation = { type: "CHILD", sourceId: sourceNode.id };

    nodeForm = {
      firstName: "",
      lastName: sourceNode.lastName || "",
      gender: "MALE",
      birthDate: "",
      deathDate: "",
      lunarBirthDate: "",
      lunarDeathDate: "",
      phone: "",
      email: "",
      major: "",
      jobPosition: "",
      customFields: data.tree.fields.map((f) => ({
        fieldId: f.id,
        value: "",
      })),
    };
    showMemberModal = true;
  }

  function openQuickAddSibling(sourceNode: typeof selectedNode) {
    if (!sourceNode) return;
    const parentRels = data.tree.nodes
      .flatMap((n) => n.relationsAsSource)
      .filter((r) => r.targetId === sourceNode.id && r.type === "PARENT_CHILD");

    if (parentRels.length === 0) {
      toast.error(
        "Cannot add sibling: selected member has no parents in the tree. Please add a parent first.",
      );
      return;
    }

    isEditingMember = false;
    editingNodeId = null;
    pendingRelation = { type: "SIBLING", sourceId: sourceNode.id };

    nodeForm = {
      firstName: "",
      lastName: sourceNode.lastName || "",
      gender: "MALE",
      birthDate: "",
      deathDate: "",
      lunarBirthDate: "",
      lunarDeathDate: "",
      phone: "",
      email: "",
      major: "",
      jobPosition: "",
      customFields: data.tree.fields.map((f) => ({
        fieldId: f.id,
        value: "",
      })),
    };
    showMemberModal = true;
  }

  function openQuickAddParent(
    sourceNode: typeof selectedNode,
    gender: "MALE" | "FEMALE",
  ) {
    if (!sourceNode) return;
    isEditingMember = false;
    editingNodeId = null;
    pendingRelation = { type: "PARENT", sourceId: sourceNode.id, gender };

    nodeForm = {
      firstName: "",
      lastName: gender === "MALE" ? sourceNode.lastName || "" : "",
      gender,
      birthDate: "",
      deathDate: "",
      lunarBirthDate: "",
      lunarDeathDate: "",
      phone: "",
      email: "",
      major: "",
      jobPosition: "",
      customFields: data.tree.fields.map((f) => ({
        fieldId: f.id,
        value: "",
      })),
    };
    showMemberModal = true;
  }

  async function handleSaveMember(e: SubmitEvent) {
    e.preventDefault();
    if (!nodeForm.firstName.trim()) {
      toast.error("First name is required");
      return;
    }
    if (!nodeForm.birthDate) {
      toast.error("Birth date is required");
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
        toast.error("No member selected for editing.");
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
            : response.error.value?.message || "Failed to save member details.",
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
            .flatMap((n) => n.relationsAsSource)
            .filter(
              (r) => r.targetId === sourceId && r.type === "PARENT_CHILD",
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
          ? "Member updated successfully!"
          : "Member added successfully!",
      );
      showMemberModal = false;
      await invalidateAll();
    } catch (err) {
      toast.error("Failed to save member details.");
      console.error(err);
    }
  }

  async function handleDeleteMember(id: string) {
    if (
      !confirm(
        "Are you sure you want to delete this family member? All relationships linking to them will be removed.",
      )
    ) {
      return;
    }

    try {
      const { error } = await client.api.workspace.nodes({ id }).delete();

      if (error) {
        throw new Error((error.value as string) || "Failed to delete member.");
      }

      toast.success("Member removed");
      selectedNodeId = null;
      await invalidateAll();
    } catch (err) {
      toast.error("Failed to delete member.");
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

  async function handleAddRelationship(e: SubmitEvent) {
    e.preventDefault();
    if (!relTargetId) {
      toast.error("Target member is required");
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
          (error.value as string) || "Failed to create relationship.",
        );
      }

      toast.success("Relationship established!");
      showRelationshipModal = false;
      await invalidateAll();
    } catch (err) {
      toast.error("Failed to create relationship.");
      console.error(err);
    }
  }

  async function handleDeleteRelationship(edgeId: string) {
    if (
      !confirm("Are you sure you want to break this relationship connection?")
    ) {
      return;
    }
    try {
      const { error } = await client.api.workspace
        .edges({ id: edgeId })
        .delete();
      if (error)
        throw new Error(
          (error.value as string) || "Failed to remove connection",
        );
      toast.success("Connection broken");
      await invalidateAll();
    } catch (err) {
      toast.error("Failed to remove connection");
      console.error(err);
    }
  }

  // Collaborators management
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
          (error.value as string) || "Failed to invite collaborator",
        );
      }

      toast.success("Collaborator added successfully!");
      inviteEmailOrUsername = "";
      await invalidateAll();
    } catch (err) {
      toast.error("Failed to invite collaborator. Check email/username.");
      console.error(err);
    } finally {
      isInviting = false;
    }
  }

  async function handleRemoveCollaborator(memberId: string) {
    if (!confirm("Remove this collaborator from the tree?")) return;

    try {
      const { error } = await client.api
        .trees({ id: data.tree.id })
        .members({ memberId })
        .delete();

      if (error)
        throw new Error(
          (error.value as string) || "Failed to remove collaborator",
        );
      toast.success("Collaborator removed");
      await invalidateAll();
    } catch (err) {
      toast.error("Failed to remove collaborator");
      console.error(err);
    }
  }

  // Custom Fields management
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
          (error.value as string) || "Failed to create custom field",
        );
      toast.success("Custom field added successfully!");
      newFieldName = "";
      await invalidateAll();
    } catch (err) {
      toast.error("Failed to create custom field.");
      console.error(err);
    } finally {
      isCreatingField = false;
    }
  }

  async function handleDeleteField(fieldId: string) {
    if (
      !confirm(
        "Delete this custom field? This will delete this value from ALL family members in this tree.",
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
          (error.value as string) || "Failed to delete custom field",
        );
      toast.success("Custom field deleted");
      await invalidateAll();
    } catch (err) {
      toast.error("Failed to delete custom field.");
      console.error(err);
    }
  }

  let customKinshipPathKey = $state("");
  let customKinshipTerm = $state("");
  let isSavingKinshipTerm = $state(false);

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
          (error.value as string) || "Failed to save kinship override",
        );
      toast.success("Kinship term override saved!");
      customKinshipPathKey = "";
      customKinshipTerm = "";
      await invalidateAll();
    } catch (err) {
      toast.error("Failed to save kinship override");
      console.error(err);
    } finally {
      isSavingKinshipTerm = false;
    }
  }

  async function handleDeleteKinshipTerm(termId: string) {
    if (!confirm("Remove this kinship override?")) return;
    try {
      const { error } = await client.api.workspace["kinship-terms"]({
        id: termId,
      }).delete();
      if (error)
        throw new Error((error.value as string) || "Failed to remove override");
      toast.success("Override removed");
      await invalidateAll();
    } catch (err) {
      toast.error("Failed to remove override");
      console.error(err);
    }
  }

  $effect(() => {
    // Run fit view on load
    setTimeout(fitView, 100);
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
      <Button
        variant={activeTab === "tree" ? "default" : "ghost"}
        size="sm"
        onclick={() => (activeTab = "tree")}
        class="h-7 text-xs px-3"
      >
        Visual Tree
      </Button>
      <Button
        variant={activeTab === "members" ? "default" : "ghost"}
        size="sm"
        onclick={() => (activeTab = "members")}
        class="h-7 text-xs px-3"
      >
        Collaborators
      </Button>
      <Button
        variant={activeTab === "fields" ? "default" : "ghost"}
        size="sm"
        onclick={() => (activeTab = "fields")}
        class="h-7 text-xs px-3"
      >
        Custom Fields
      </Button>
    </div>
  </div>

  {#if activeTab === "tree"}
    <!-- VISUAL TREE TAB -->
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
                <title>{edge.type} Link</title>
              </path>
            {/each}
          </svg>

          <!-- Member Node Cards -->
          {#each layout.renderNodes as node}
            {@const hasChildren = data.tree.nodes.some((child) =>
              child.relationsAsTarget.some(
                (rel) =>
                  rel.sourceId === node.id && rel.type === "PARENT_CHILD",
              ),
            )}
            {@const isCollapsed = collapsedNodes.has(node.id)}
            {@const hasParents = data.tree.nodes.some((parent) =>
              parent.relationsAsSource.some(
                (rel) =>
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
                    ? "Expand ancestors"
                    : "Collapse ancestors"}
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
                title="Hide member and subtree"
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
                        Deceased
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
                  title={isCollapsed ? "Expand branch" : "Collapse branch"}
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
          title="Zoom In"
        >
          <ZoomIn class="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onclick={zoomOut}
          class="h-9 w-9 rounded-lg"
          title="Zoom Out"
        >
          <ZoomOut class="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onclick={fitView}
          class="h-9 w-9 rounded-lg"
          title="Fit View"
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
            <span>Add Member</span>
          </Button>
        {/if}

        {#if focusedRootNodeId}
          {@const rn = data.tree.nodes.find(
            (node) => node.id === focusedRootNodeId,
          )}
          {#if rn}
            <Button
              variant="outline"
              class="shadow-lg flex items-center gap-2 border-emerald-300 hover:border-emerald-500 bg-background"
              onclick={resetFocusSubtree}
            >
              <Maximize2 class="h-4 w-4 text-emerald-600" />
              <span>Root: {rn.lastName || ""} {rn.firstName}</span>
              <X class="h-3.5 w-3.5 text-muted-foreground ml-1" />
            </Button>
          {/if}
        {/if}

        {#if cognatesRootNodeId}
          {@const cn = data.tree.nodes.find(
            (node) => node.id === cognatesRootNodeId,
          )}
          {#if cn}
            <Button
              variant="outline"
              class="shadow-lg flex items-center gap-2 border-blue-300 hover:border-blue-500 bg-background"
              onclick={resetCognatesRootNode}
            >
              <Users class="h-4 w-4 text-blue-600" />
              <span>Relatives: {cn.lastName || ""} {cn.firstName}</span>
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
                "Select a hidden member in the sidebar to unhide them.",
              );
            }}
          >
            <EyeOff class="h-4 w-4 text-rose-500" />
            <span>Hidden ({userHiddenNodes.size})</span>
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
              <h4 class="font-semibold text-sm">Select a Family Member</h4>
              <p class="text-xs max-w-xs mt-1">
                Click on any person card in the canvas layout to view
                biographies, life timelines, custom fields, and calculate
                kinship links.
              </p>
            </div>

            {#if userHiddenNodes.size > 0}
              <div
                class="border-t p-6 max-h-[350px] flex flex-col min-h-0 bg-muted/20"
              >
                <h4 class="font-semibold text-sm mb-3 flex items-center gap-2">
                  <EyeOff class="h-4 w-4 text-rose-500" />
                  Hidden Members ({userHiddenNodes.size})
                </h4>
                <div class="overflow-y-auto space-y-2 flex-1 pr-1">
                  {#each Array.from(userHiddenNodes) as nodeId}
                    {@const n = data.tree.nodes.find(
                      (node) => node.id === nodeId,
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
                          title="Unhide member"
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
                {selectedNode.gender} Profile
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
                  <span
                    >{selectedNode.jobPosition || "Member"}{selectedNode.major
                      ? ` • ${selectedNode.major}`
                      : ""}</span
                  >
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
                  <span
                    >{cognatesRootNodeId === selectedNode.id
                      ? "Show All"
                      : "Blood Relatives"}</span
                  >
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
                  <span
                    >{focusedRootNodeId === selectedNode.id
                      ? "Full Tree"
                      : "Make Root"}</span
                  >
                </Button>

                <Button
                  variant="outline"
                  size="xs"
                  class="h-7 text-xs flex items-center gap-1 px-3 rounded-full hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200"
                  onclick={() => hideNode(selectedNode.id)}
                >
                  <EyeOff class="h-3.5 w-3.5" />
                  <span>Hide Member</span>
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
                  Personal Information
                </h4>
                {#if data.role !== "VIEWER"}
                  <div class="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      class="h-7 text-xs"
                      onclick={() => openEditMember(selectedNode)}
                    >
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      class="h-7 text-xs text-destructive hover:bg-destructive/10"
                      onclick={() => handleDeleteMember(selectedNode.id)}
                    >
                      Delete
                    </Button>
                  </div>
                {/if}
              </div>

              <div
                class="grid grid-cols-2 gap-4 bg-muted/40 p-4 rounded-xl text-xs space-y-0.5"
              >
                <div>
                  <span class="text-muted-foreground block">Birth Date</span>
                  <span class="font-medium"
                    >{selectedNode.birthDate
                      ? new Date(selectedNode.birthDate).toLocaleDateString()
                      : "Unknown"}</span
                  >
                </div>
                {#if selectedNode.lunarBirthDate}
                  <div>
                    <span class="text-muted-foreground block"
                      >Lunar Birth Date</span
                    >
                    <span class="font-medium"
                      >{selectedNode.lunarBirthDate}</span
                    >
                  </div>
                {/if}
                {#if selectedNode.deathDate}
                  <div>
                    <span class="text-muted-foreground block"
                      >Deceased Date</span
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
                      >Lunar Death Date</span
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
                  Quick Add Relative
                </h4>
                <div class="grid grid-cols-2 gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    class="h-8 text-xs flex items-center justify-start gap-1.5 px-3 border border-dashed border-primary/40 hover:border-primary text-primary bg-primary/5 hover:bg-primary/10"
                    onclick={() => openQuickAddSpouse(selectedNode)}
                  >
                    <Plus class="h-3.5 w-3.5" />
                    <span>Husband / Wife</span>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    class="h-8 text-xs flex items-center justify-start gap-1.5 px-3 border border-dashed border-primary/40 hover:border-primary text-primary bg-primary/5 hover:bg-primary/10"
                    onclick={() => openQuickAddChild(selectedNode)}
                  >
                    <Plus class="h-3.5 w-3.5" />
                    <span>Child</span>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    class="h-8 text-xs flex items-center justify-start gap-1.5 px-3 border border-dashed border-primary/40 hover:border-primary text-primary bg-primary/5 hover:bg-primary/10 col-span-2"
                    onclick={() => openQuickAddSibling(selectedNode)}
                  >
                    <Plus class="h-3.5 w-3.5" />
                    <span>Brother / Sister</span>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    class="h-8 text-xs flex items-center justify-start gap-1.5 px-3 border border-dashed border-muted-foreground/30 hover:border-muted-foreground text-muted-foreground hover:bg-muted/40"
                    onclick={() => openQuickAddParent(selectedNode, "MALE")}
                  >
                    <Plus class="h-3.5 w-3.5" />
                    <span>Father (Add Parent)</span>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    class="h-8 text-xs flex items-center justify-start gap-1.5 px-3 border border-dashed border-muted-foreground/30 hover:border-muted-foreground text-muted-foreground hover:bg-muted/40"
                    onclick={() => openQuickAddParent(selectedNode, "FEMALE")}
                  >
                    <Plus class="h-3.5 w-3.5" />
                    <span>Mother (Add Parent)</span>
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
                  Custom Field Attributes
                </h4>
                <div class="space-y-2">
                  {#each selectedNode.customValues as cv}
                    {@const definition = data.tree.fields.find(
                      (f) => f.id === cv.fieldId,
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
                <h4 class="font-serif font-bold text-lg">Relationships</h4>
                {#if data.role !== "VIEWER"}
                  <Button
                    variant="outline"
                    size="sm"
                    onclick={() => openAddRelationship(selectedNode.id)}
                    class="h-7 text-xs flex items-center gap-1"
                  >
                    <UserPlus class="h-3 w-3" />
                    <span>Link Relation</span>
                  </Button>
                {/if}
              </div>

              <!-- List Source Relations (e.g. Spouses, Children) -->

              {#if selectedSourceRels.length === 0 && selectedTargetRels.length === 0}
                <p class="text-xs text-muted-foreground italic">
                  No relationship lines mapped. Link parents or spouses.
                </p>
              {:else}
                <div class="space-y-2 text-xs">
                  <!-- Spouses -->
                  {#each selectedSpouses as { relId, spouseNode }}
                    <div
                      class="flex items-center justify-between p-2 rounded bg-muted/30"
                    >
                      <span
                        >Spouse: <strong
                          >{spouseNode.lastName || ""}
                          {spouseNode.firstName}</strong
                        ></span
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
                  {#each selectedTargetRels.filter((r) => r.type === "PARENT_CHILD") as rel}
                    {@const parent = data.tree.nodes.find(
                      (n) => n.id === rel.sourceId,
                    )}
                    {#if parent}
                      <div
                        class="flex items-center justify-between p-2 rounded bg-muted/30"
                      >
                        <span
                          >Parent: <strong
                            >{parent.lastName || ""} {parent.firstName}</strong
                          ></span
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
                  {#each selectedSourceRels.filter((r) => r.type === "PARENT_CHILD") as rel}
                    {@const child = data.tree.nodes.find(
                      (n) => n.id === rel.targetId,
                    )}
                    {#if child}
                      <div
                        class="flex items-center justify-between p-2 rounded bg-muted/30"
                      >
                        <span
                          >Child: <strong
                            >{child.lastName || ""} {child.firstName}</strong
                          ></span
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
                <span>Kinship Calculator</span>
              </h4>

              <div class="space-y-3">
                <Label for="kinship-target" class="text-xs"
                  >Compare relationship to:</Label
                >
                <Combobox
                  id="kinship-target"
                  bind:value={kinshipTargetId}
                  options={data.tree.nodes
                    .filter((n) => n.id !== selectedNode.id)
                    .map((n) => ({
                      value: n.id,
                      label: `${n.lastName || ""} ${n.firstName}`,
                    }))}
                  placeholder="-- Choose family member --"
                  searchPlaceholder="Search family member..."
                />

                {#if kinshipCalculated}
                  <div
                    class="bg-primary/5 border border-primary/20 p-4 rounded-xl mt-2 animate-in fade-in slide-in-from-top-1 duration-200"
                  >
                    <p
                      class="text-xs text-muted-foreground uppercase tracking-wider font-semibold"
                    >
                      Calculated Relation
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
              <h4 class="font-serif font-bold text-lg">Life Timeline</h4>
              {#if selectedTimeline.length === 0}
                <p class="text-xs text-muted-foreground italic">
                  No timeline events detected.
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
  {:else}
    <!-- OTHER TABS: COLLABORATORS & CUSTOM SCHEMA -->
    <div
      class="max-w-4xl mx-auto px-4 sm:px-6 py-8 flex-1 w-full space-y-8 overflow-y-auto"
    >
      {#if activeTab === "members"}
        <!-- COLLABORATORS SETTINGS TAB (OWNER only invites, others view) -->
        <div class="space-y-6">
          <div>
            <h3 class="font-serif text-2xl font-bold">Tree Collaboration</h3>
            <p class="text-muted-foreground text-sm">
              Manage who has access to view or edit this family tree.
            </p>
          </div>

          {#if data.role === "OWNER"}
            <Card class="p-6">
              <h4 class="font-serif font-bold mb-3 text-base">
                Invite Collaborator
              </h4>
              <form
                onsubmit={handleInviteCollaborator}
                class="flex flex-col sm:flex-row gap-4 items-end"
              >
                <div class="flex-1 space-y-2">
                  <Label for="collab-name">User Email or Username</Label>
                  <Input
                    id="collab-name"
                    placeholder="Enter email or username..."
                    bind:value={inviteEmailOrUsername}
                    disabled={isInviting}
                    required
                  />
                </div>
                <div class="w-full sm:w-48 space-y-2">
                  <Label for="collab-role">Access Role</Label>
                  <Combobox
                    id="collab-role"
                    bind:value={inviteRole}
                    disabled={isInviting}
                    options={[
                      { value: "VIEWER", label: "Viewer (Read Only)" },
                      { value: "EDITOR", label: "Editor (Can edit tree)" },
                    ]}
                    placeholder="Select access role..."
                    searchPlaceholder="Search roles..."
                  />
                </div>
                <Button
                  type="submit"
                  disabled={isInviting}
                  class="w-full sm:w-auto flex items-center gap-1.5"
                >
                  <UserPlus class="h-4 w-4" />
                  <span>Invite</span>
                </Button>
              </form>
            </Card>
          {/if}

          <!-- Collaborator List -->
          <div class="space-y-3">
            <h4 class="font-semibold text-sm text-muted-foreground">
              Active Collaborators
            </h4>
            <!-- Fetch client-side if server loader isn't updated, but we have member query in our API router, so let's call it! -->
            <!-- For simplicity and speed, let's load this via clientside load / api fetch -->
            <!-- We will fetch it in layout / page or load on mount -->
            {#if treeMembers.length === 0}
              <p class="text-xs text-muted-foreground italic">
                No collaborators found.
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
                          title="Remove user"
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
      {:else if activeTab === "fields"}
        <!-- CUSTOM FIELDS TAB -->
        <div class="space-y-6">
          <div>
            <h3 class="font-serif text-2xl font-bold">
              Dynamic Profile Schema
            </h3>
            <p class="text-muted-foreground text-sm font-serif">
              Define custom fields that will be available for all member
              profiles in this tree.
            </p>
          </div>

          {#if data.role === "OWNER"}
            <Card class="p-6">
              <h4 class="font-bold mb-3 text-base font-serif">
                Create Custom Field
              </h4>
              <form
                onsubmit={handleCreateField}
                class="flex flex-col sm:flex-row gap-4 items-end"
              >
                <div class="flex-1 space-y-2">
                  <Label for="field-name">Field Label</Label>
                  <Input
                    id="field-name"
                    placeholder="e.g., Military Rank, Burial Location, Clan Branch..."
                    bind:value={newFieldName}
                    disabled={isCreatingField}
                    required
                  />
                </div>
                <div class="w-full sm:w-48 space-y-2">
                  <Label for="field-type">Field Data Type</Label>
                  <Combobox
                    id="field-type"
                    bind:value={newFieldType}
                    disabled={isCreatingField}
                    options={[
                      { value: "STRING", label: "Text (String)" },
                      { value: "NUMBER", label: "Number" },
                      { value: "DATE", label: "Gregorian Date" },
                      { value: "BOOLEAN", label: "Yes / No (Boolean)" },
                    ]}
                    placeholder="Select field type..."
                    searchPlaceholder="Search field types..."
                  />
                </div>
                <Button
                  type="submit"
                  disabled={isCreatingField}
                  class="w-full sm:w-auto flex items-center gap-1.5"
                >
                  <Plus class="h-4 w-4" />
                  <span>Add Field</span>
                </Button>
              </form>
            </Card>
          {/if}

          <!-- Custom Fields List -->
          <div class="space-y-3">
            <h4 class="font-semibold text-sm text-muted-foreground">
              Active Fields Definition
            </h4>
            {#if data.tree.fields.length === 0}
              <div
                class="border rounded-xl p-8 text-center text-muted-foreground bg-background/50"
              >
                No custom fields defined. Create one above to add bespoke
                information to profiles.
              </div>
            {:else}
              <div
                class="border rounded-xl divide-y bg-background overflow-hidden"
              >
                {#each data.tree.fields as field}
                  <div class="flex items-center justify-between p-4 text-sm">
                    <div>
                      <span class="font-semibold block">{field.name}</span>
                      <span class="text-xs text-muted-foreground block"
                        >Type: {field.type}</span
                      >
                    </div>

                    {#if data.role === "OWNER"}
                      <Button
                        variant="ghost"
                        size="icon"
                        class="text-destructive hover:bg-destructive/10"
                        onclick={() => handleDeleteField(field.id)}
                        title="Delete custom field definition"
                      >
                        <Trash2 class="h-4 w-4" />
                      </Button>
                    {/if}
                  </div>
                {/each}
              </div>
            {/if}
          </div>

          <!-- Kinship Term Overrides -->
          <div class="border-t pt-8 space-y-6">
            <div>
              <h3 class="font-serif text-2xl font-bold">
                Kinship Term Overrides
              </h3>
              <p class="text-muted-foreground text-sm font-serif">
                Override default Vietnamese kinship translations for specific
                relationship paths.
              </p>
            </div>

            {#if data.role === "OWNER"}
              <Card class="p-6">
                <h4 class="font-bold mb-3 text-base font-serif">
                  Create Kinship Override
                </h4>
                <form
                  onsubmit={handleSaveKinshipTerm}
                  class="flex flex-col sm:flex-row gap-4 items-end"
                >
                  <div class="flex-1 space-y-2">
                    <Label for="path-key"
                      >Path Key (e.g. PARENT.CHILD, SPOUSE)</Label
                    >
                    <Combobox
                      id="path-key"
                      bind:value={customKinshipPathKey}
                      options={[
                        { value: "SPOUSE", label: "Spouse (Vợ/Chồng)" },
                        { value: "PARENT", label: "Parent (Bố/Mẹ)" },
                        { value: "CHILD", label: "Child (Con)" },
                        {
                          value: "PARENT.CHILD",
                          label: "Sibling (Anh/Chị/Em)",
                        },
                        {
                          value: "PARENT.PARENT",
                          label: "Grandparent (Ông/Bà)",
                        },
                        {
                          value: "CHILD.CHILD",
                          label: "Grandchild (Cháu nội/ngoại)",
                        },
                        {
                          value: "PARENT.PARENT.CHILD",
                          label: "Aunt/Uncle (Bác/Cô/Chú/Cậu/Dì)",
                        },
                        {
                          value: "PARENT.PARENT.CHILD.CHILD",
                          label: "Cousin (Anh/Chị/Em họ)",
                        },
                      ]}
                      placeholder="-- Choose Relationship Path --"
                      searchPlaceholder="Search paths..."
                    />
                  </div>
                  <div class="flex-1 space-y-2">
                    <Label for="custom-term"
                      >Custom Term Translation (Vietnamese)</Label
                    >
                    <Input
                      id="custom-term"
                      placeholder="e.g. Bác trưởng, Mợ hai, Dì út..."
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
                    <span>Save Override</span>
                  </Button>
                </form>
              </Card>
            {/if}

            <!-- Overrides List -->
            <div class="space-y-3">
              <h4 class="font-semibold text-sm text-muted-foreground">
                Active Term Overrides
              </h4>
              {#if !data.tree.customTerms || data.tree.customTerms.length === 0}
                <div
                  class="border rounded-xl p-8 text-center text-muted-foreground bg-background/50"
                >
                  No custom kinship overrides defined.
                </div>
              {:else}
                <div
                  class="border rounded-xl divide-y bg-background overflow-hidden"
                >
                  {#each data.tree.customTerms as term}
                    <div class="flex items-center justify-between p-4 text-sm">
                      <div>
                        <span class="font-semibold block">{term.term}</span>
                        <span class="text-xs text-muted-foreground block"
                          >Path Key: {term.pathKey}</span
                        >
                      </div>

                      {#if data.role === "OWNER"}
                        <Button
                          variant="ghost"
                          size="icon"
                          class="text-destructive hover:bg-destructive/10"
                          onclick={() => handleDeleteKinshipTerm(term.id)}
                          title="Delete override"
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
      {/if}
    </div>
  {/if}
</div>

<!-- MEMBER MODAL (ADD / EDIT) -->
{#if showMemberModal}
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto"
  >
    <div
      class="w-full max-w-2xl bg-background border rounded-xl shadow-2xl p-6 relative my-8 animate-in fade-in zoom-in-95 duration-200"
    >
      <button
        onclick={() => (showMemberModal = false)}
        class="absolute top-4 right-4 text-muted-foreground hover:text-foreground"
      >
        <X class="h-5 w-5" />
      </button>

      <h3 class="font-serif text-2xl font-bold mb-2">
        {isEditingMember ? "Edit Family Member Profile" : "Add Family Member"}
      </h3>
      <p class="text-muted-foreground text-sm mb-4">
        Complete the fields to document this family member node details.
      </p>

      <form onsubmit={handleSaveMember} class="space-y-6">
        <!-- Name & Gender -->
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div class="space-y-2">
            <Label for="node-lastname">Last Name (Họ & Tên đệm)</Label>
            <Input
              id="node-lastname"
              placeholder="e.g., Nguyễn Văn"
              bind:value={nodeForm.lastName}
            />
          </div>
          <div class="space-y-2">
            <Label for="node-firstname">First Name (Tên)</Label>
            <Input
              id="node-firstname"
              placeholder="e.g., A, C, Minh"
              bind:value={nodeForm.firstName}
              required
            />
          </div>
          <div class="space-y-2">
            <Label for="node-gender">Gender</Label>
            <Combobox
              id="node-gender"
              bind:value={nodeForm.gender}
              options={[
                { value: "MALE", label: "Male" },
                { value: "FEMALE", label: "Female" },
              ]}
              placeholder="Select gender..."
              searchPlaceholder="Search genders..."
            />
          </div>
        </div>

        <!-- Dates (Gregorian and Lunar) -->
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t pt-4">
          <div class="space-y-2">
            <Label for="node-birth">Gregorian Birth Date</Label>
            <DatePicker
              id="node-birth"
              bind:value={nodeForm.birthDate}
              placeholder="Select birth date..."
            />
          </div>
          <div class="space-y-2">
            <Label for="node-lunar-birth">Traditional Lunar Birth Date</Label>
            <Input
              id="node-lunar-birth"
              placeholder="e.g., 01/12/Kỷ Mão"
              bind:value={nodeForm.lunarBirthDate}
            />
          </div>
          <div class="space-y-2">
            <Label for="node-death">Gregorian Deceased Date (Optional)</Label>
            <DatePicker
              id="node-death"
              bind:value={nodeForm.deathDate}
              placeholder="Select deceased date..."
            />
          </div>
          <div class="space-y-2">
            <Label for="node-lunar-death">Traditional Lunar Deceased Date</Label
            >
            <Input
              id="node-lunar-death"
              placeholder="e.g., 05/11/Tân Sửu"
              bind:value={nodeForm.lunarDeathDate}
            />
          </div>
        </div>

        <!-- Career & Contact -->
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t pt-4">
          <div class="space-y-2">
            <Label for="node-phone">Phone Number</Label>
            <Input
              id="node-phone"
              placeholder="e.g., 0912345678"
              bind:value={nodeForm.phone}
            />
          </div>
          <div class="space-y-2">
            <Label for="node-email">Email Address</Label>
            <Input
              type="email"
              id="node-email"
              placeholder="e.g., contact@mail.com"
              bind:value={nodeForm.email}
            />
          </div>
          <div class="space-y-2">
            <Label for="node-major">Field of Study / Major</Label>
            <Input
              id="node-major"
              placeholder="e.g., Computer Science, Teacher"
              bind:value={nodeForm.major}
            />
          </div>
          <div class="space-y-2">
            <Label for="node-job">Job / Occupation</Label>
            <Input
              id="node-job"
              placeholder="e.g., Lead Developer, Director"
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
              Bespoke Fields Attributes
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
                        { value: "true", label: "Yes" },
                        { value: "false", label: "No" },
                      ]}
                      placeholder="-- Choose --"
                      searchPlaceholder="Search..."
                    />
                  {:else if field.type === "DATE"}
                    <DatePicker
                      id={`cf-${field.id}`}
                      bind:value={nodeForm.customFields[i].value}
                      placeholder="Select date..."
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
                      placeholder="Enter value..."
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
            onclick={() => (showMemberModal = false)}
          >
            Cancel
          </Button>
          <Button type="submit">Save Details</Button>
        </div>
      </form>
    </div>
  </div>
{/if}

<!-- RELATIONSHIP MODAL -->
{#if showRelationshipModal}
  {@const sourceNode = data.tree.nodes.find((n) => n.id === relSourceId)}
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
  >
    <div
      class="w-full max-w-md bg-background border rounded-xl shadow-2xl p-6 relative animate-in fade-in zoom-in-95 duration-200"
    >
      <button
        onclick={() => (showRelationshipModal = false)}
        class="absolute top-4 right-4 text-muted-foreground hover:text-foreground"
      >
        <X class="h-5 w-5" />
      </button>

      <h3 class="font-serif text-2xl font-bold mb-2">Establish Relationship</h3>
      <p class="text-muted-foreground text-sm mb-4">
        Link <strong
          >{sourceNode?.lastName || ""} {sourceNode?.firstName}</strong
        > to another family member node.
      </p>

      <form onsubmit={handleAddRelationship} class="space-y-4">
        <div class="space-y-2">
          <Label for="rel-type">Relationship Type</Label>
          <Combobox
            id="rel-type"
            bind:value={relType}
            options={[
              {
                value: "PARENT_CHILD",
                label: "Parent-Child link (Source is Parent, Target is Child)",
              },
              { value: "SPOUSE", label: "Spousal partnership" },
            ]}
            placeholder="Select relationship type..."
            searchPlaceholder="Search types..."
          />
        </div>

        <div class="space-y-2">
          <Label for="rel-target">Select Target Member</Label>
          <Combobox
            id="rel-target"
            bind:value={relTargetId}
            options={data.tree.nodes
              .filter((n) => n.id !== relSourceId)
              .map((otherNode) => ({
                value: otherNode.id,
                label: `${otherNode.lastName || ""} ${otherNode.firstName}`,
              }))}
            placeholder="-- Choose target person --"
            searchPlaceholder="Search target person..."
          />
        </div>

        <div class="flex justify-end gap-3 pt-2">
          <Button
            type="button"
            variant="ghost"
            onclick={() => (showRelationshipModal = false)}
          >
            Cancel
          </Button>
          <Button type="submit">Establish Connection</Button>
        </div>
      </form>
    </div>
  </div>
{/if}
