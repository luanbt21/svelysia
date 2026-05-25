import { db } from "$lib/server/db";
import { error } from "@sveltejs/kit";
import type { LayoutServerLoad } from "./$types";

export const load: LayoutServerLoad = async ({ params, parent }) => {
  const { user } = await parent();
  const { id } = params;

  const membership = await db.treeMember.findFirst({
    where: { treeId: id, userId: user.id },
  });

  if (!membership) {
    throw error(403, "You do not have access to this family tree.");
  }

  const tree = await db.tree.findUnique({
    where: { id },
    include: {
      members: {
        include: {
          user: true,
        },
      },
      nodes: {
        include: {
          customValues: true,
          relationsAsSource: true,
          relationsAsTarget: true,
        },
      },
      fields: true,
      customTerms: true,
    },
  });

  if (!tree) {
    throw error(404, "Family tree not found.");
  }

  return {
    tree,
    role: membership.role,
  };
};
