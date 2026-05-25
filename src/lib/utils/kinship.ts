import { type TreeLayoutNode, type TreeLayoutEdge } from "./tree-layout";

export interface KinshipResult {
  path: string[];
  termVi: string;
  termEn: string;
}

export function calculateKinship(
  sourceId: string,
  targetId: string,
  nodes: TreeLayoutNode[],
  edges: TreeLayoutEdge[],
  customTerms: { pathKey: string; term: string }[] = []
): KinshipResult {
  const result = getStandardKinship(sourceId, targetId, nodes, edges);
  const pathKey = result.path.join(".");
  const override = customTerms.find(ct => ct.pathKey === pathKey);
  if (override) {
    return {
      ...result,
      termVi: override.term,
    };
  }
  return result;
}

function getStandardKinship(
  sourceId: string,
  targetId: string,
  nodes: TreeLayoutNode[],
  edges: TreeLayoutEdge[]
): KinshipResult {
  if (sourceId === targetId) {
    return { path: [], termVi: "Bản thân", termEn: "Self" };
  }

  const nodeMap = new Map<string, TreeLayoutNode>();
  for (const n of nodes) {
    nodeMap.set(n.id, n);
  }

  // Build adjacency graph: key: node ID, value: array of { targetId, type, label }
  // We treat relationships as bidirectional but track direction
  const graph = new Map<string, { to: string; type: "PARENT" | "CHILD" | "SPOUSE" }[]>();

  for (const n of nodes) {
    graph.set(n.id, []);
  }

  for (const edge of edges) {
    const src = edge.sourceId;
    const tgt = edge.targetId;
    if (!graph.has(src) || !graph.has(tgt)) continue;

    if (edge.type === "SPOUSE") {
      graph.get(src)!.push({ to: tgt, type: "SPOUSE" });
      graph.get(tgt)!.push({ to: src, type: "SPOUSE" });
    } else if (edge.type === "PARENT_CHILD") {
      // Source is parent, target is child
      graph.get(src)!.push({ to: tgt, type: "CHILD" });
      graph.get(tgt)!.push({ to: src, type: "PARENT" });
    }
  }

  // BFS to find the shortest path
  const queue: { current: string; path: { to: string; type: "PARENT" | "CHILD" | "SPOUSE" }[] }[] = [];
  const visited = new Set<string>();

  queue.push({ current: sourceId, path: [] });
  visited.add(sourceId);

  let foundPath: { to: string; type: "PARENT" | "CHILD" | "SPOUSE" }[] | null = null;

  while (queue.length > 0) {
    const { current, path } = queue.shift()!;

    if (current === targetId) {
      foundPath = path;
      break;
    }

    const neighbors = graph.get(current) || [];
    for (const edge of neighbors) {
      if (!visited.has(edge.to)) {
        visited.add(edge.to);
        queue.push({
          current: edge.to,
          path: [...path, edge],
        });
      }
    }
  }

  if (!foundPath) {
    return { path: [], termVi: "Họ hàng xa / Chưa xác định", termEn: "Distant relative / Unknown" };
  }

  const pathStr = foundPath.map(p => p.type);
  const targetNode = nodeMap.get(targetId)!;
  const targetGender = targetNode.gender;

  // Let's analyze common paths
  // 1. Direct spouse
  if (pathStr.length === 1 && pathStr[0] === "SPOUSE") {
    return {
      path: pathStr,
      termVi: targetGender === "MALE" ? "Chồng" : "Vợ",
      termEn: targetGender === "MALE" ? "Husband" : "Wife",
    };
  }

  // 2. Direct parent
  if (pathStr.length === 1 && pathStr[0] === "PARENT") {
    return {
      path: pathStr,
      termVi: targetGender === "MALE" ? "Bố" : "Mẹ",
      termEn: targetGender === "MALE" ? "Father" : "Mother",
    };
  }

  // 3. Direct child
  if (pathStr.length === 1 && pathStr[0] === "CHILD") {
    return {
      path: pathStr,
      termVi: targetGender === "MALE" ? "Con trai" : "Con gái",
      termEn: targetGender === "MALE" ? "Son" : "Daughter",
    };
  }

  // 4. Sibling (Parent -> Child)
  if (pathStr.length === 2 && pathStr[0] === "PARENT" && pathStr[1] === "CHILD") {
    // Sibling
    const sourceNode = nodeMap.get(sourceId)!;
    const isOlder = new Date(targetNode.birthDate) < new Date(sourceNode.birthDate);
    if (targetGender === "MALE") {
      return {
        path: pathStr,
        termVi: isOlder ? "Anh trai" : "Em trai",
        termEn: isOlder ? "Older Brother" : "Younger Brother",
      };
    } else {
      return {
        path: pathStr,
        termVi: isOlder ? "Chị gái" : "Em gái",
        termEn: isOlder ? "Older Sister" : "Younger Sister",
      };
    }
  }

  // 5. Grandparent (Parent -> Parent)
  if (pathStr.length === 2 && pathStr[0] === "PARENT" && pathStr[1] === "PARENT") {
    const parentNode = nodeMap.get(foundPath[0].to)!;
    const isPaternal = parentNode.gender === "MALE";
    if (targetGender === "MALE") {
      return {
        path: pathStr,
        termVi: isPaternal ? "Ông nội" : "Ông ngoại",
        termEn: isPaternal ? "Paternal Grandfather" : "Maternal Grandfather",
      };
    } else {
      return {
        path: pathStr,
        termVi: isPaternal ? "Bà nội" : "Bà ngoại",
        termEn: isPaternal ? "Paternal Grandmother" : "Maternal Grandmother",
      };
    }
  }

  // 6. Grandchild (Child -> Child)
  if (pathStr.length === 2 && pathStr[0] === "CHILD" && pathStr[1] === "CHILD") {
    const childNode = nodeMap.get(foundPath[0].to)!;
    const isPaternal = childNode.gender === "MALE";
    if (targetGender === "MALE") {
      return {
        path: pathStr,
        termVi: isPaternal ? "Cháu nội (Trai)" : "Cháu ngoại (Trai)",
        termEn: isPaternal ? "Paternal Grandson" : "Maternal Grandson",
      };
    } else {
      return {
        path: pathStr,
        termVi: isPaternal ? "Cháu nội (Gái)" : "Cháu ngoại (Gái)",
        termEn: isPaternal ? "Paternal Granddaughter" : "Maternal Granddaughter",
      };
    }
  }

  // 7. Aunt/Uncle (Parent -> Parent -> Child)
  if (
    pathStr.length === 3 &&
    pathStr[0] === "PARENT" &&
    pathStr[1] === "PARENT" &&
    pathStr[2] === "CHILD"
  ) {
    const parentNode = nodeMap.get(foundPath[0].to)!;
    const grandparentNode = nodeMap.get(foundPath[1].to)!;
    const isPaternal = parentNode.gender === "MALE";
    
    // Check if older or younger than parent
    const parentBirth = new Date(parentNode.birthDate).getTime();
    const targetBirth = new Date(targetNode.birthDate).getTime();
    const isOlderThanParent = targetBirth < parentBirth;

    if (isPaternal) {
      if (targetGender === "MALE") {
        return {
          path: pathStr,
          termVi: isOlderThanParent ? "Bác (Bên nội)" : "Chú (Bên nội)",
          termEn: isOlderThanParent ? "Paternal Uncle (Older)" : "Paternal Uncle (Younger)",
        };
      } else {
        return {
          path: pathStr,
          termVi: "Cô (Bên nội)",
          termEn: "Paternal Aunt",
        };
      }
    } else {
      if (targetGender === "MALE") {
        return {
          path: pathStr,
          termVi: "Cậu (Bên ngoại)",
          termEn: "Maternal Uncle",
        };
      } else {
        return {
          path: pathStr,
          termVi: "Dì (Bên ngoại)",
          termEn: "Maternal Aunt",
        };
      }
    }
  }

  // 8. Cousin (Parent -> Parent -> Child -> Child)
  if (
    pathStr.length === 4 &&
    pathStr[0] === "PARENT" &&
    pathStr[1] === "PARENT" &&
    pathStr[2] === "CHILD" &&
    pathStr[3] === "CHILD"
  ) {
    return {
      path: pathStr,
      termVi: targetGender === "MALE" ? "Anh/Em họ" : "Chị/Em họ",
      termEn: "Cousin",
    };
  }

  // 9. Step-Parent (Parent -> Spouse)
  if (pathStr.length === 2 && pathStr[0] === "PARENT" && pathStr[1] === "SPOUSE") {
    return {
      path: pathStr,
      termVi: targetGender === "MALE" ? "Bố dượng / Bố kế" : "Dì ghẻ / Mẹ kế",
      termEn: targetGender === "MALE" ? "Stepfather" : "Stepmother",
    };
  }

  // 10. Nephew / Niece (Parent -> Child -> Child)
  if (pathStr.length === 3 && pathStr[0] === "PARENT" && pathStr[1] === "CHILD" && pathStr[2] === "CHILD") {
    return {
      path: pathStr,
      termVi: targetGender === "MALE" ? "Cháu (Gọi bằng Bác/Cô/Chú/Cậu)" : "Cháu gái (Gọi bằng Bác/Cô/Chú/Cậu)",
      termEn: targetGender === "MALE" ? "Nephew" : "Niece",
    };
  }

  // Default fallback for longer paths
  // Count parents and children in path
  const parentsCount = pathStr.filter(p => p === "PARENT").length;
  const childrenCount = pathStr.filter(p => p === "CHILD").length;

  if (parentsCount === 3 && childrenCount === 0) {
    return {
      path: pathStr,
      termVi: targetGender === "MALE" ? "Cụ ông" : "Cụ bà",
      termEn: "Great-Grandparent",
    };
  }
  if (parentsCount === 0 && childrenCount === 3) {
    return {
      path: pathStr,
      termVi: "Chắt",
      termEn: "Great-Grandchild",
    };
  }

  return {
    path: pathStr,
    termVi: `Họ hàng (${parentsCount} đời lên, ${childrenCount} đời xuống)`,
    termEn: `Relative (${parentsCount} gen up, ${childrenCount} gen down)`,
  };
}
