import { Elysia, t } from "elysia";
import { db } from "$lib/server/db";
import { betterAuthMiddleware } from "./middleware";

export const treesRouter = new Elysia({ prefix: "/trees" })
  .use(betterAuthMiddleware)
  
  // Get all trees the authenticated user is a member of
  .get("/", async ({ user, set }) => {
    if (!user) {
      set.status = 401;
      return "Unauthorized";
    }
    try {
      const treeMemberships = await db.treeMember.findMany({
        where: { userId: user.id },
        include: { tree: true },
      });
      return treeMemberships.map((mt) => ({
        ...mt.tree,
        role: mt.role,
      }));
    } catch (err) {
      console.error("Failed to fetch trees:", err);
      set.status = 500;
      return "Internal Server Error";
    }
  }, { auth: true })

  // Create a new tree (creates Tree, and TreeMember with role OWNER)
  .post("/", async ({ user, body, set }) => {
    if (!user) {
      set.status = 401;
      return "Unauthorized";
    }
    const { name, description } = body;
    try {
      const newTree = await db.tree.create({
        data: {
          name,
          description,
        },
      });

      // Create owner membership
      await db.treeMember.create({
        data: {
          treeId: newTree.id,
          userId: user.id,
          role: "OWNER",
        },
      });

      return { ...newTree, role: "OWNER" };
    } catch (err) {
      console.error("Failed to create tree:", err);
      set.status = 500;
      return "Failed to create tree";
    }
  }, {
    auth: true,
    body: t.Object({
      name: t.String({ minLength: 1 }),
      description: t.Optional(t.String()),
    }),
  })

  // Get a specific family tree with all nodes, edges, custom fields, and custom terms
  .get("/:id", async ({ user, params: { id }, set }) => {
    if (!user) {
      set.status = 401;
      return "Unauthorized";
    }
    try {
      // Check if user is a member
      const membership = await db.treeMember.findFirst({
        where: { treeId: id, userId: user.id },
      });
      if (!membership) {
        set.status = 403;
        return "You do not have access to this family tree.";
      }

      const tree = await db.tree.findUnique({
        where: { id },
        include: {
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
        set.status = 404;
        return "Family tree not found.";
      }

      return { tree, role: membership.role };
    } catch (err) {
      console.error("Failed to fetch tree:", err);
      set.status = 500;
      return "Internal Server Error";
    }
  }, { auth: true })

  // Delete a tree (Only tree OWNER)
  .delete("/:id", async ({ user, params: { id }, set }) => {
    if (!user) {
      set.status = 401;
      return "Unauthorized";
    }
    try {
      const membership = await db.treeMember.findFirst({
        where: { treeId: id, userId: user.id },
      });
      if (!membership || membership.role !== "OWNER") {
        set.status = 403;
        return "Only the tree owner can delete this family tree.";
      }

      await db.tree.delete({
        where: { id },
      });

      return { success: true, message: "Family tree deleted successfully." };
    } catch (err) {
      console.error("Failed to delete tree:", err);
      set.status = 500;
      return "Failed to delete tree.";
    }
  }, { auth: true })

  // Get members of a tree
  .get("/:id/members", async ({ user, params: { id }, set }) => {
    if (!user) {
      set.status = 401;
      return "Unauthorized";
    }
    try {
      const membership = await db.treeMember.findFirst({
        where: { treeId: id, userId: user.id },
      });
      if (!membership) {
        set.status = 403;
        return "Access denied.";
      }

      const members = await db.treeMember.findMany({
        where: { treeId: id },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              image: true,
              username: true,
            },
          },
        },
      });

      return members;
    } catch (err) {
      console.error("Failed to fetch members:", err);
      set.status = 500;
      return "Failed to fetch members.";
    }
  }, { auth: true })

  // Add/invite a member to the tree (Only OWNER)
  .post("/:id/members", async ({ user, params: { id }, body, set }) => {
    if (!user) {
      set.status = 401;
      return "Unauthorized";
    }
    try {
      const membership = await db.treeMember.findFirst({
        where: { treeId: id, userId: user.id },
      });
      if (!membership || membership.role !== "OWNER") {
        set.status = 403;
        return "Only the owner can manage collaborations.";
      }

      const { emailOrUsername, role } = body;

      // Find user in system
      const targetUser = await db.user.findFirst({
        where: {
          OR: [
            { email: emailOrUsername },
            { username: emailOrUsername },
          ],
        },
      });

      if (!targetUser) {
        set.status = 404;
        return "User not found in system.";
      }

      // Check if already member
      const existingMember = await db.treeMember.findFirst({
        where: { treeId: id, userId: targetUser.id },
      });
      if (existingMember) {
        set.status = 400;
        return "User is already a member of this tree.";
      }

      const newMember = await db.treeMember.create({
        data: {
          treeId: id,
          userId: targetUser.id,
          role,
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              image: true,
              username: true,
            },
          },
        },
      });

      return newMember;
    } catch (err) {
      console.error("Failed to add member:", err);
      set.status = 500;
      return "Failed to add member.";
    }
  }, {
    auth: true,
    body: t.Object({
      emailOrUsername: t.String(),
      role: t.Union([t.Literal("EDITOR"), t.Literal("VIEWER")]),
    }),
  })

  // Update collaborator's role (Only OWNER)
  .patch("/:id/members/:memberId", async ({ user, params: { id, memberId }, body, set }) => {
    if (!user) {
      set.status = 401;
      return "Unauthorized";
    }
    try {
      const requesterMembership = await db.treeMember.findFirst({
        where: { treeId: id, userId: user.id },
      });
      if (!requesterMembership || requesterMembership.role !== "OWNER") {
        set.status = 403;
        return "Only the owner can update roles.";
      }

      const targetMember = await db.treeMember.findUnique({
        where: { id: memberId },
      });
      if (!targetMember) {
        set.status = 404;
        return "Collaborator not found.";
      }
      if (targetMember.userId === user.id) {
        set.status = 400;
        return "You cannot change your own role.";
      }

      const updated = await db.treeMember.update({
        where: { id: memberId },
        data: { role: body.role },
      });

      return updated;
    } catch (err) {
      console.error("Failed to update member role:", err);
      set.status = 500;
      return "Failed to update member role.";
    }
  }, {
    auth: true,
    body: t.Object({
      role: t.Union([t.Literal("EDITOR"), t.Literal("VIEWER")]),
    }),
  })

  // Remove collaborator (Only OWNER)
  .delete("/:id/members/:memberId", async ({ user, params: { id, memberId }, set }) => {
    if (!user) {
      set.status = 401;
      return "Unauthorized";
    }
    try {
      const requesterMembership = await db.treeMember.findFirst({
        where: { treeId: id, userId: user.id },
      });
      if (!requesterMembership || requesterMembership.role !== "OWNER") {
        set.status = 403;
        return "Only the owner can remove collaborators.";
      }

      const targetMember = await db.treeMember.findUnique({
        where: { id: memberId },
      });
      if (!targetMember) {
        set.status = 404;
        return "Collaborator not found.";
      }
      if (targetMember.userId === user.id) {
        set.status = 400;
        return "You cannot remove yourself. Delete the tree instead.";
      }

      await db.treeMember.delete({
        where: { id: memberId },
      });

      return { success: true, message: "Collaborator removed successfully." };
    } catch (err) {
      console.error("Failed to remove member:", err);
      set.status = 500;
      return "Failed to remove member.";
    }
  }, { auth: true });
