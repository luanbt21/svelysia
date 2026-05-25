import { db } from "$lib/server/db";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ parent }) => {
  const { user } = await parent();

  const treeMemberships = await db.treeMember.findMany({
    where: { userId: user.id },
    include: { tree: true },
  });

  return {
    trees: treeMemberships.map((mt) => ({
      ...mt.tree,
      role: mt.role,
    })),
  };
};
