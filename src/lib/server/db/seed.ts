import { db } from "../db";

async function main() {
  console.log("🌱 Seeding database...");

  // 1. Create a Seed User
  const userId = "seed-user-id";
  const email = "luanbt21@gmail.com";
  
  // Clean existing seed data to allow re-running
  try {
    await db.user.delete({ where: { id: userId } });
    console.log("Deleted old seed user (and cascaded trees).");
  } catch (err) {
    // ignore if not exists
  }

  const user = await db.user.create({
    data: {
      id: userId,
      name: "Luan Nguyen",
      email: email,
      emailVerified: true,
      username: "luannguyen",
      role: "user",
    },
  });
  console.log(`Created User: ${user.name} (${user.email})`);

  // 2. Create a Family Tree
  const tree = await db.tree.create({
    data: {
      name: "Gia Phả Họ Nguyễn (Nguyễn Family Tree)",
      description: "Hồ sơ phả hệ 3 thế hệ của dòng họ Nguyễn bắt đầu từ cụ Nguyễn Văn A.",
    },
  });
  console.log(`Created Tree: ${tree.name}`);

  // 3. Add user as Tree OWNER
  await db.treeMember.create({
    data: {
      treeId: tree.id,
      userId: user.id,
      role: "OWNER",
    },
  });
  console.log(`Assigned User as OWNER of the tree.`);

  // 4. Create Nodes (Family Members)
  // Generation 1: Grandparents
  const grandfather = await db.node.create({
    data: {
      treeId: tree.id,
      firstName: "A",
      lastName: "Nguyễn Văn",
      gender: "MALE",
      birthDate: new Date("1940-01-01"),
      lunarBirthDate: "01/12/Kỷ Mão",
      phone: "0901234567",
      email: "ong.nguyena@gmail.com",
    },
  });

  const grandmother = await db.node.create({
    data: {
      treeId: tree.id,
      firstName: "B",
      lastName: "Lê Thị",
      gender: "FEMALE",
      birthDate: new Date("1943-05-10"),
      lunarBirthDate: "06/04/Quý Mùi",
      phone: "0907654321",
    },
  });

  // Generation 2: Children and Spouses
  const son = await db.node.create({
    data: {
      treeId: tree.id,
      firstName: "C",
      lastName: "Nguyễn Văn",
      gender: "MALE",
      birthDate: new Date("1965-03-12"),
      lunarBirthDate: "10/02/Ất Tỵ",
      phone: "0911223344",
      major: "Kỹ sư xây dựng",
      jobPosition: "Trưởng phòng",
    },
  });

  const daughterInLaw = await db.node.create({
    data: {
      treeId: tree.id,
      firstName: "D",
      lastName: "Trần Thị",
      gender: "FEMALE",
      birthDate: new Date("1968-07-20"),
    },
  });

  const daughter = await db.node.create({
    data: {
      treeId: tree.id,
      firstName: "E",
      lastName: "Nguyễn Thị",
      gender: "FEMALE",
      birthDate: new Date("1970-11-05"),
      phone: "0922334455",
      major: "Giáo viên",
    },
  });

  const sonInLaw = await db.node.create({
    data: {
      treeId: tree.id,
      firstName: "F",
      lastName: "Phạm Văn",
      gender: "MALE",
      birthDate: new Date("1968-02-14"),
    },
  });

  // Generation 3: Grandchildren
  const grandson1 = await db.node.create({
    data: {
      treeId: tree.id,
      firstName: "G",
      lastName: "Nguyễn Văn",
      gender: "MALE",
      birthDate: new Date("1995-09-18"),
      major: "Lập trình viên",
    },
  });

  const granddaughter = await db.node.create({
    data: {
      treeId: tree.id,
      firstName: "H",
      lastName: "Nguyễn Thị",
      gender: "FEMALE",
      birthDate: new Date("1998-12-01"),
    },
  });

  const grandson2 = await db.node.create({
    data: {
      treeId: tree.id,
      firstName: "I",
      lastName: "Phạm Văn",
      gender: "MALE",
      birthDate: new Date("1997-04-30"),
    },
  });

  console.log("Created 9 family member nodes.");

  // 5. Create Edges (Relationships)
  // G1 Spouses
  await db.edge.create({
    data: {
      sourceId: grandfather.id,
      targetId: grandmother.id,
      type: "SPOUSE",
      order: 1,
    },
  });

  // G1 to G2 Parent-Child links (Father & Mother to Son & Daughter)
  const parents = [grandfather.id, grandmother.id];
  for (const parentId of parents) {
    await db.edge.create({
      data: { sourceId: parentId, targetId: son.id, type: "PARENT_CHILD", order: 1 },
    });
    await db.edge.create({
      data: { sourceId: parentId, targetId: daughter.id, type: "PARENT_CHILD", order: 2 },
    });
  }

  // G2 Spouses (Son & Daughter-in-law)
  await db.edge.create({
    data: {
      sourceId: son.id,
      targetId: daughterInLaw.id,
      type: "SPOUSE",
      order: 1,
    },
  });

  // G2 Spouses (Daughter & Son-in-law)
  await db.edge.create({
    data: {
      sourceId: sonInLaw.id,
      targetId: daughter.id,
      type: "SPOUSE",
      order: 1,
    },
  });

  // G2 to G3 Parent-Child links
  // Son & Daughter-in-law to grandson1 & granddaughter
  const sonParents = [son.id, daughterInLaw.id];
  for (const parentId of sonParents) {
    await db.edge.create({
      data: { sourceId: parentId, targetId: grandson1.id, type: "PARENT_CHILD", order: 1 },
    });
    await db.edge.create({
      data: { sourceId: parentId, targetId: granddaughter.id, type: "PARENT_CHILD", order: 2 },
    });
  }

  // Daughter & Son-in-law to grandson2
  const daughterParents = [sonInLaw.id, daughter.id];
  for (const parentId of daughterParents) {
    await db.edge.create({
      data: { sourceId: parentId, targetId: grandson2.id, type: "PARENT_CHILD", order: 1 },
    });
  }

  console.log("Created all relationships (edges).");
  console.log("🌱 Seeding finished successfully!");
}

main()
  .catch((e) => {
    console.error("Error during seeding:", e);
    process.exit(1);
  })
  .finally(async () => {
    // End pool
  });
