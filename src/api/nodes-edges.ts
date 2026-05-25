import { Elysia, t } from "elysia";
import { db } from "$lib/server/db";
import { betterAuthMiddleware } from "./middleware";

// Helper to check user membership and role in a tree
async function checkTreeAccess(userId: string, treeId: string, allowedRoles: string[] = ["OWNER", "EDITOR"]) {
  const membership = await db.treeMember.findFirst({
    where: { treeId, userId },
  });
  return membership && allowedRoles.includes(membership.role) ? membership : null;
}

export const nodesEdgesRouter = new Elysia({ prefix: "/workspace" })
  .use(betterAuthMiddleware)

  // 1. Create a Family Member Node
  .post("/nodes", async ({ user, body, set }) => {
    if (!user) {
      set.status = 401;
      return "Unauthorized";
    }
    const { treeId, firstName, lastName, gender, birthDate, deathDate, lunarBirthDate, lunarDeathDate, phone, email, major, jobPosition, customFields } = body;

    // Verify access
    const access = await checkTreeAccess(user.id, treeId);
    if (!access) {
      set.status = 403;
      return "You do not have permission to modify this family tree.";
    }

    try {
      const node = await db.node.create({
        data: {
          treeId,
          firstName,
          lastName,
          gender,
          birthDate: new Date(birthDate),
          deathDate: deathDate ? new Date(deathDate) : null,
          lunarBirthDate,
          lunarDeathDate,
          phone,
          email,
          major,
          jobPosition,
        },
      });

      // Handle custom fields if any
      if (customFields && Array.isArray(customFields)) {
        for (const cf of customFields) {
          if (cf.fieldId && cf.value !== undefined) {
            await db.customFieldValue.create({
              data: {
                nodeId: node.id,
                fieldId: cf.fieldId,
                value: String(cf.value),
              },
            });
          }
        }
      }

      // Re-fetch node with custom values
      const fullNode = await db.node.findUnique({
        where: { id: node.id },
        include: { customValues: true },
      });

      return fullNode;
    } catch (err) {
      console.error("Failed to create node:", err);
      set.status = 500;
      return "Failed to create family member.";
    }
  }, {
    auth: true,
    body: t.Object({
      treeId: t.String(),
      firstName: t.String({ minLength: 1 }),
      lastName: t.Optional(t.String()),
      gender: t.Union([t.Literal("MALE"), t.Literal("FEMALE")]),
      birthDate: t.String(),
      deathDate: t.Optional(t.String()),
      lunarBirthDate: t.Optional(t.String()),
      lunarDeathDate: t.Optional(t.String()),
      phone: t.Optional(t.String()),
      email: t.Optional(t.String()),
      major: t.Optional(t.String()),
      jobPosition: t.Optional(t.String()),
      customFields: t.Optional(t.Array(t.Object({
        fieldId: t.String(),
        value: t.Any(),
      }))),
    }),
  })

  // 2. Update a Family Member Node
  .patch("/nodes/:id", async ({ user, params: { id }, body, set }) => {
    if (!user) {
      set.status = 401;
      return "Unauthorized";
    }
    
    try {
      const node = await db.node.findUnique({ where: { id } });
      if (!node) {
        set.status = 404;
        return "Family member not found.";
      }

      // Verify access
      const access = await checkTreeAccess(user.id, node.treeId);
      if (!access) {
        set.status = 403;
        return "You do not have permission to modify this family tree.";
      }

      const { firstName, lastName, gender, birthDate, deathDate, lunarBirthDate, lunarDeathDate, phone, email, major, jobPosition, customFields } = body;

      await db.node.update({
        where: { id },
        data: {
          firstName: firstName !== undefined ? firstName : undefined,
          lastName: lastName !== undefined ? lastName : undefined,
          gender: gender !== undefined ? gender : undefined,
          birthDate: birthDate !== undefined ? new Date(birthDate) : undefined,
          deathDate: deathDate !== undefined ? (deathDate ? new Date(deathDate) : null) : undefined,
          lunarBirthDate: lunarBirthDate !== undefined ? lunarBirthDate : undefined,
          lunarDeathDate: lunarDeathDate !== undefined ? lunarDeathDate : undefined,
          phone: phone !== undefined ? phone : undefined,
          email: email !== undefined ? email : undefined,
          major: major !== undefined ? major : undefined,
          jobPosition: jobPosition !== undefined ? jobPosition : undefined,
        },
      });

      // Handle custom fields
      if (customFields && Array.isArray(customFields)) {
        for (const cf of customFields) {
          if (cf.fieldId && cf.value !== undefined) {
            await db.customFieldValue.upsert({
              where: {
                nodeId_fieldId: {
                  nodeId: id,
                  fieldId: cf.fieldId,
                },
              },
              update: { value: String(cf.value) },
              create: {
                nodeId: id,
                fieldId: cf.fieldId,
                value: String(cf.value),
              },
            });
          }
        }
      }

      // Re-fetch full node
      const fullNode = await db.node.findUnique({
        where: { id },
        include: { customValues: true },
      });

      return fullNode;
    } catch (err) {
      console.error("Failed to update node:", err);
      set.status = 500;
      return "Failed to update family member.";
    }
  }, {
    auth: true,
    body: t.Object({
      firstName: t.Optional(t.String()),
      lastName: t.Optional(t.String()),
      gender: t.Optional(t.Union([t.Literal("MALE"), t.Literal("FEMALE")])),
      birthDate: t.Optional(t.String()),
      deathDate: t.Optional(t.String()),
      lunarBirthDate: t.Optional(t.String()),
      lunarDeathDate: t.Optional(t.String()),
      phone: t.Optional(t.String()),
      email: t.Optional(t.String()),
      major: t.Optional(t.String()),
      jobPosition: t.Optional(t.String()),
      customFields: t.Optional(t.Array(t.Object({
        fieldId: t.String(),
        value: t.Any(),
      }))),
    }),
  })

  // 3. Delete a Family Member Node
  .delete("/nodes/:id", async ({ user, params: { id }, set }) => {
    if (!user) {
      set.status = 401;
      return "Unauthorized";
    }

    try {
      const node = await db.node.findUnique({ where: { id } });
      if (!node) {
        set.status = 404;
        return "Family member not found.";
      }

      // Verify access
      const access = await checkTreeAccess(user.id, node.treeId);
      if (!access) {
        set.status = 403;
        return "You do not have permission to modify this family tree.";
      }

      await db.node.delete({
        where: { id },
      });

      return { success: true, message: "Member deleted successfully." };
    } catch (err) {
      console.error("Failed to delete node:", err);
      set.status = 500;
      return "Failed to delete family member.";
    }
  }, { auth: true })

  // 4. Create a Relationship Edge
  .post("/edges", async ({ user, body, set }) => {
    if (!user) {
      set.status = 401;
      return "Unauthorized";
    }
    const { sourceId, targetId, type, order } = body;

    try {
      // Fetch source node to check treeId
      const sourceNode = await db.node.findUnique({ where: { id: sourceId } });
      const targetNode = await db.node.findUnique({ where: { id: targetId } });
      if (!sourceNode || !targetNode) {
        set.status = 404;
        return "Source or target node not found.";
      }
      if (sourceNode.treeId !== targetNode.treeId) {
        set.status = 400;
        return "Nodes must belong to the same family tree.";
      }

      // Verify access
      const access = await checkTreeAccess(user.id, sourceNode.treeId);
      if (!access) {
        set.status = 403;
        return "You do not have permission to modify this family tree.";
      }

      // Check if relationship already exists
      const existing = await db.edge.findFirst({
        where: {
          OR: [
            { sourceId, targetId, type },
            { sourceId: targetId, targetId: sourceId, type }, // Spouse is symmetric in UI logic
          ],
        },
      });
      if (existing) {
        set.status = 400;
        return "This relationship already exists.";
      }

      const edge = await db.edge.create({
        data: {
          sourceId,
          targetId,
          type,
          order,
        },
      });

      return edge;
    } catch (err) {
      console.error("Failed to create relationship:", err);
      set.status = 500;
      return "Failed to create relationship.";
    }
  }, {
    auth: true,
    body: t.Object({
      sourceId: t.String(),
      targetId: t.String(),
      type: t.Union([t.Literal("PARENT_CHILD"), t.Literal("SPOUSE")]),
      order: t.Optional(t.Number()),
    }),
  })

  // 5. Delete a Relationship Edge
  .delete("/edges/:id", async ({ user, params: { id }, set }) => {
    if (!user) {
      set.status = 401;
      return "Unauthorized";
    }

    try {
      const edge = await db.edge.findUnique({
        where: { id },
        include: { source: true },
      });
      if (!edge) {
        set.status = 404;
        return "Relationship not found.";
      }

      // Verify access
      const access = await checkTreeAccess(user.id, edge.source.treeId);
      if (!access) {
        set.status = 403;
        return "You do not have permission to modify this family tree.";
      }

      await db.edge.delete({ where: { id } });

      return { success: true, message: "Relationship removed successfully." };
    } catch (err) {
      console.error("Failed to delete edge:", err);
      set.status = 500;
      return "Failed to delete relationship.";
    }
  }, { auth: true })

  // 6. Create a Custom Field Definition (Owner Only)
  .post("/custom-fields", async ({ user, body, set }) => {
    if (!user) {
      set.status = 401;
      return "Unauthorized";
    }
    const { treeId, name, type } = body;

    const access = await checkTreeAccess(user.id, treeId, ["OWNER"]);
    if (!access) {
      set.status = 403;
      return "Only the tree owner can define custom fields.";
    }

    try {
      const field = await db.customField.create({
        data: {
          treeId,
          name,
          type,
        },
      });

      return field;
    } catch (err) {
      console.error("Failed to create custom field:", err);
      set.status = 500;
      return "Failed to create custom field.";
    }
  }, {
    auth: true,
    body: t.Object({
      treeId: t.String(),
      name: t.String({ minLength: 1 }),
      type: t.Union([
        t.Literal("STRING"),
        t.Literal("NUMBER"),
        t.Literal("DATE"),
        t.Literal("BOOLEAN"),
      ]),
    }),
  })

  // 7. Delete a Custom Field Definition (Owner Only)
  .delete("/custom-fields/:id", async ({ user, params: { id }, set }) => {
    if (!user) {
      set.status = 401;
      return "Unauthorized";
    }

    try {
      const field = await db.customField.findUnique({ where: { id } });
      if (!field) {
        set.status = 404;
        return "Custom field not found.";
      }

      const access = await checkTreeAccess(user.id, field.treeId, ["OWNER"]);
      if (!access) {
        set.status = 403;
        return "Only the tree owner can delete custom fields.";
      }

      await db.customField.delete({ where: { id } });

      return { success: true, message: "Custom field deleted successfully." };
    } catch (err) {
      console.error("Failed to delete custom field:", err);
      set.status = 500;
      return "Failed to delete custom field.";
    }
  }, { auth: true })

  // 8. Get Custom Kinship Terms
  .get("/trees/:id/kinship-terms", async ({ user, params: { id }, set }) => {
    if (!user) {
      set.status = 401;
      return "Unauthorized";
    }
    const access = await checkTreeAccess(user.id, id, ["OWNER", "EDITOR", "VIEWER"]);
    if (!access) {
      set.status = 403;
      return "Access denied.";
    }

    try {
      const terms = await db.customKinshipTerm.findMany({
        where: { treeId: id },
      });
      return terms;
    } catch (err) {
      console.error("Failed to fetch custom kinship terms:", err);
      set.status = 500;
      return "Failed to fetch custom kinship terms.";
    }
  }, { auth: true })

  // 9. Upsert Custom Kinship Term (Owner Only)
  .post("/kinship-terms", async ({ user, body, set }) => {
    if (!user) {
      set.status = 401;
      return "Unauthorized";
    }
    const { treeId, pathKey, term } = body;

    const access = await checkTreeAccess(user.id, treeId, ["OWNER"]);
    if (!access) {
      set.status = 403;
      return "Only the tree owner can define custom kinship terms.";
    }

    try {
      const existing = await db.customKinshipTerm.findFirst({
        where: { treeId, pathKey },
      });

      if (existing) {
        const updated = await db.customKinshipTerm.update({
          where: { id: existing.id },
          data: { term },
        });
        return updated;
      } else {
        const created = await db.customKinshipTerm.create({
          data: { treeId, pathKey, term },
        });
        return created;
      }
    } catch (err) {
      console.error("Failed to save custom kinship term:", err);
      set.status = 500;
      return "Failed to save custom kinship term.";
    }
  }, {
    auth: true,
    body: t.Object({
      treeId: t.String(),
      pathKey: t.String(),
      term: t.String({ minLength: 1 }),
    }),
  })

  // 10. Delete Custom Kinship Term (Owner Only)
  .delete("/kinship-terms/:id", async ({ user, params: { id }, set }) => {
    if (!user) {
      set.status = 401;
      return "Unauthorized";
    }

    try {
      const term = await db.customKinshipTerm.findUnique({ where: { id } });
      if (!term) {
        set.status = 404;
        return "Kinship term override not found.";
      }

      const access = await checkTreeAccess(user.id, term.treeId, ["OWNER"]);
      if (!access) {
        set.status = 403;
        return "Only the tree owner can remove kinship term overrides.";
      }

      await db.customKinshipTerm.delete({ where: { id } });

      return { success: true, message: "Custom kinship term removed successfully." };
    } catch (err) {
      console.error("Failed to delete custom kinship term:", err);
      set.status = 500;
      return "Failed to delete custom kinship term.";
    }
  }, { auth: true });
