export interface TreeLayoutNode {
  id: string;
  firstName: string;
  lastName: string | null;
  gender: "MALE" | "FEMALE";
  birthDate: Date | string;
  deathDate: Date | string | null;
  lunarBirthDate?: string | null;
  lunarDeathDate?: string | null;
  phone?: string | null;
  email?: string | null;
  major?: string | null;
  jobPosition?: string | null;
  customValues?: Record<string, string>[];
}

export interface TreeLayoutEdge {
  id: string;
  sourceId: string;
  targetId: string;
  type: "PARENT_CHILD" | "SPOUSE";
  order: number | null;
  metadata?: Record<string, string>;
}

export interface RenderNode {
  id: string;
  data: TreeLayoutNode;
  x: number;
  y: number;
  width: number;
  height: number;
  generation: number;
  spouses: string[]; // Spouses' node IDs
  isSpouse?: boolean;
  primaryId?: string;
}

export interface RenderEdge {
  id: string;
  path: string; // SVG path command (d attribute)
  type: "PARENT_CHILD" | "SPOUSE";
}

interface FamilyGroup {
  id: string;
  primaryId: string;
  memberIds: string[];
  children: FamilyGroup[];
  relX: number;
  width: number;
  subtreeWidth: number;
}

export function computeTreeLayout(
  nodes: TreeLayoutNode[],
  edges: TreeLayoutEdge[],
): { renderNodes: RenderNode[]; renderEdges: RenderEdge[] } {
  const nodeWidth = 200;
  const nodeHeight = 90;
  const spouseGap = 30; // Space between spouses side-by-side
  const siblingGap = 80; // Space between sibling subtrees horizontally
  const horizontalGap = 80; // Space between distinct root family subtrees
  const verticalGap = 160;

  const nodeMap = new Map<string, TreeLayoutNode>();
  for (const n of nodes) {
    nodeMap.set(n.id, n);
  }

  // Parse birth date safely to milliseconds
  function getBirthTime(node: TreeLayoutNode): number {
    if (!node.birthDate) return 0;
    const time = new Date(node.birthDate).getTime();
    return isNaN(time) ? 0 : time;
  }

  function getBirthTimeById(id: string): number {
    const node = nodeMap.get(id);
    return node ? getBirthTime(node) : 0;
  }

  // Build graph representations
  const spousesOf = new Map<string, string[]>();
  const childrenOf = new Map<string, string[]>(); // key: parent ID, value: child IDs
  const parentsOf = new Map<string, string[]>(); // key: child ID, value: parent IDs

  for (const edge of edges) {
    if (edge.type === "SPOUSE") {
      if (!spousesOf.has(edge.sourceId)) spousesOf.set(edge.sourceId, []);
      if (!spousesOf.has(edge.targetId)) spousesOf.set(edge.targetId, []);
      spousesOf.get(edge.sourceId)!.push(edge.targetId);
      spousesOf.get(edge.targetId)!.push(edge.sourceId);
    } else if (edge.type === "PARENT_CHILD") {
      if (!childrenOf.has(edge.sourceId)) childrenOf.set(edge.sourceId, []);
      childrenOf.get(edge.sourceId)!.push(edge.targetId);

      if (!parentsOf.has(edge.targetId)) parentsOf.set(edge.targetId, []);
      parentsOf.get(edge.targetId)!.push(edge.sourceId);
    }
  }

  // Sort spouses and children of each node by birthdate chronologically (left-to-right)
  for (const [nodeId, spouses] of spousesOf.entries()) {
    spouses.sort((a, b) => getBirthTimeById(a) - getBirthTimeById(b));
  }

  for (const [parentId, kids] of childrenOf.entries()) {
    kids.sort((a, b) => getBirthTimeById(a) - getBirthTimeById(b));
  }

  const visitedInGroup = new Set<string>();

  function buildFamilyGroup(primaryId: string): FamilyGroup | null {
    if (visitedInGroup.has(primaryId) || !nodeMap.has(primaryId)) return null;

    const spouses = spousesOf.get(primaryId) || [];
    const memberIds = [primaryId];
    visitedInGroup.add(primaryId);

    // Group spouses side-by-side with the primary member
    for (const spouseId of spouses) {
      if (!visitedInGroup.has(spouseId) && nodeMap.has(spouseId)) {
        memberIds.push(spouseId);
        visitedInGroup.add(spouseId);
      }
    }

    // Collect all children of these parents
    const childrenSet = new Set<string>();
    for (const parentId of memberIds) {
      const kids = childrenOf.get(parentId) || [];
      for (const kidId of kids) {
        if (nodeMap.has(kidId)) {
          childrenSet.add(kidId);
        }
      }
    }

    // Sort children chronologically by birthdate
    const sortedChildren = Array.from(childrenSet).sort(
      (a, b) => getBirthTimeById(a) - getBirthTimeById(b),
    );

    const childGroups: FamilyGroup[] = [];
    for (const childId of sortedChildren) {
      const childGroup = buildFamilyGroup(childId);
      if (childGroup) {
        childGroups.push(childGroup);
      }
    }

    return {
      id: primaryId,
      primaryId,
      memberIds,
      children: childGroups,
      relX: 0,
      width: 0,
      subtreeWidth: 0,
    };
  }

  // Identify roots (nodes with no parents) and sort them chronologically by birthdate
  const roots = nodes
    .filter((n) => !parentsOf.has(n.id) || parentsOf.get(n.id)!.length === 0)
    .sort((a, b) => getBirthTime(a) - getBirthTime(b));

  const rootGroups: FamilyGroup[] = [];
  for (const root of roots) {
    const group = buildFamilyGroup(root.id);
    if (group) {
      rootGroups.push(group);
    }
  }

  // Handle remaining orphan nodes that might have missed grouping (e.g. cyclic links or disconnected nodes)
  const remainingNodes = nodes
    .filter((n) => !visitedInGroup.has(n.id))
    .sort((a, b) => getBirthTime(a) - getBirthTime(b));

  for (const n of remainingNodes) {
    const group = buildFamilyGroup(n.id);
    if (group) {
      rootGroups.push(group);
    }
  }

  // Pass 1: Recursively calculate subtree widths
  function calculateSubtreeWidths(group: FamilyGroup) {
    const membersCount = group.memberIds.length;
    group.width = membersCount * nodeWidth + (membersCount - 1) * spouseGap;

    if (group.children.length === 0) {
      group.subtreeWidth = group.width;
      return;
    }

    // Compute layout for child subtrees
    let totalChildrenSubtreeWidth = 0;
    for (let i = 0; i < group.children.length; i++) {
      const child = group.children[i];
      calculateSubtreeWidths(child);
      totalChildrenSubtreeWidth += child.subtreeWidth;
      if (i < group.children.length - 1) {
        totalChildrenSubtreeWidth += siblingGap;
      }
    }

    group.subtreeWidth = Math.max(group.width, totalChildrenSubtreeWidth);
  }

  const coords = new Map<
    string,
    { x: number; y: number; gen: number; isSpouse: boolean; primaryId: string }
  >();

  // Pass 2: Assign absolute coordinates using subtree boundaries
  function assignAbsoluteCoordinates(group: FamilyGroup, xOffset: number, level: number) {
    // xOffset is the absolute left boundary of this group's subtree.
    // Center the group's parent nodes within its subtree.
    const absoluteGroupLeft = xOffset + (group.subtreeWidth - group.width) / 2;

    // Map family group members side-by-side
    for (let i = 0; i < group.memberIds.length; i++) {
      const memberId = group.memberIds[i];
      const memberX = absoluteGroupLeft + i * (nodeWidth + spouseGap);
      coords.set(memberId, {
        x: memberX,
        y: level * verticalGap,
        gen: level,
        isSpouse: i > 0,
        primaryId: group.primaryId,
      });
    }

    if (group.children.length === 0) return;

    // Calculate total width of children subtrees side-by-side
    let totalChildrenSubtreeWidth = 0;
    for (let i = 0; i < group.children.length; i++) {
      totalChildrenSubtreeWidth += group.children[i].subtreeWidth;
      if (i < group.children.length - 1) {
        totalChildrenSubtreeWidth += siblingGap;
      }
    }

    // Center children subtrees collectively within this parent subtree
    const childrenStart = xOffset + (group.subtreeWidth - totalChildrenSubtreeWidth) / 2;

    // Recurse down for all children, passing their specific subtree left boundary
    let currentX = childrenStart;
    for (const child of group.children) {
      assignAbsoluteCoordinates(child, currentX, level + 1);
      currentX += child.subtreeWidth + siblingGap;
    }
  }

  // Layout all root groups horizontally
  let currentRootX = 0;
  for (const rootGroup of rootGroups) {
    calculateSubtreeWidths(rootGroup);
    assignAbsoluteCoordinates(rootGroup, currentRootX, 0);
    currentRootX += rootGroup.subtreeWidth + horizontalGap;
  }

  // Assemble RenderNode list
  const renderNodes: RenderNode[] = [];
  for (const n of nodes) {
    const pos = coords.get(n.id);
    if (!pos) continue; // safety fallback for filtered nodes
    renderNodes.push({
      id: n.id,
      data: n,
      x: pos.x,
      y: pos.y,
      width: nodeWidth,
      height: nodeHeight,
      generation: pos.gen,
      spouses: spousesOf.get(n.id) || [],
      isSpouse: pos.isSpouse,
      primaryId: pos.primaryId,
    });
  }

  // Assemble RenderEdge list (with curved connections)
  const renderEdges: RenderEdge[] = [];
  const processedSpousePairs = new Set<string>();

  for (const edge of edges) {
    const src = coords.get(edge.sourceId);
    const tgt = coords.get(edge.targetId);
    if (!src || !tgt) continue;

    if (edge.type === "SPOUSE") {
      const pairKey = [edge.sourceId, edge.targetId].sort().join("-");
      if (processedSpousePairs.has(pairKey)) continue;
      processedSpousePairs.add(pairKey);

      const left = src.x < tgt.x ? src : tgt;
      const right = src.x < tgt.x ? tgt : src;

      const x1 = left.x + nodeWidth;
      const y1 = left.y + nodeHeight / 2;
      const x2 = right.x;
      const y2 = right.y + nodeHeight / 2;

      renderEdges.push({
        id: edge.id,
        type: "SPOUSE",
        path: `M ${x1} ${y1} L ${x2} ${y2}`,
      });
    } else if (edge.type === "PARENT_CHILD") {
      const parents = parentsOf.get(edge.targetId) || [];
      const spousePair = parents.find(
        (pId) => pId !== edge.sourceId && spousesOf.get(edge.sourceId)?.includes(pId),
      );

      if (spousePair) {
        // Parents form a spouse pair: drop line from spouse midpoint, then curve to child top
        const p1 = src;
        const p2 = coords.get(spousePair)!;

        const leftX = Math.min(p1.x, p2.x) + nodeWidth;
        const rightX = Math.max(p1.x, p2.x);
        const parentMidX = leftX + (rightX - leftX) / 2;
        const parentMidY = p1.y + nodeHeight / 2;

        const childTopX = tgt.x + nodeWidth / 2;
        const childTopY = tgt.y;

        const dropY = parentMidY + 40;
        const dy = (childTopY - dropY) / 2;

        const path = `M ${parentMidX} ${parentMidY} L ${parentMidX} ${dropY} C ${parentMidX} ${dropY + dy} ${childTopX} ${childTopY - dy} ${childTopX} ${childTopY}`;

        renderEdges.push({
          id: edge.id,
          type: "PARENT_CHILD",
          path,
        });
      } else {
        // Single parent: draw curve directly from parent bottom to child top
        const parentBottomX = src.x + nodeWidth / 2;
        const parentBottomY = src.y + nodeHeight;

        const childTopX = tgt.x + nodeWidth / 2;
        const childTopY = tgt.y;

        const dy = (childTopY - parentBottomY) / 2;
        const path = `M ${parentBottomX} ${parentBottomY} C ${parentBottomX} ${parentBottomY + dy} ${childTopX} ${childTopY - dy} ${childTopX} ${childTopY}`;

        renderEdges.push({
          id: edge.id,
          type: "PARENT_CHILD",
          path,
        });
      }
    }
  }

  return { renderNodes, renderEdges };
}
