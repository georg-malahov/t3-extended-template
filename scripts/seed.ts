import { appPool, bindDbAuth } from "../src/lib/db";

async function seed() {
  const result = await appPool.query<{
    id: string;
    email: string;
    name: string | null;
  }>('select "id", "email", "name" from "User" order by "createdAt" asc limit 1');

  const user = result.rows[0];

  if (!user) {
    console.info("No users found. Skipping seed.");
    return;
  }

  const db = bindDbAuth({
    id: user.id,
    email: user.email,
    name: user.name,
  });

  const membership = await db.membership.findFirst({
    where: { userId: user.id },
    include: { organization: true },
  });

  if (!membership) {
    console.info("No organization found for seed user. Skipping seed.");
    return;
  }

  const existingProject = await db.project.findFirst({
    where: {
      organizationId: membership.organizationId,
      name: "Sample project",
    },
  });

  if (existingProject) {
    console.info("Seed data already present.");
    return;
  }

  await db.project.create({
    data: {
      name: "Sample project",
      description: "Starter project created by the template seed script.",
      organizationId: membership.organizationId,
      creatorId: user.id,
    },
  });

  console.info("Seed completed.");
}

seed()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await appPool.end();
  });
