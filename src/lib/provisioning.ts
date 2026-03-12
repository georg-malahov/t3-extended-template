import { bindDbAuth } from "@/lib/db";

function slugify(input: string) {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
}

export async function provisionWorkspaceForUser(user: {
  id: string;
  email: string;
  name?: string | null;
}) {
  const authedDb = bindDbAuth({
    id: user.id,
    email: user.email,
    name: user.name ?? null,
  });

  await authedDb.user.upsert({
    where: { id: user.id },
    update: {
      email: user.email,
      name: user.name ?? null,
    },
    create: {
      id: user.id,
      email: user.email,
      name: user.name ?? null,
    },
  });

  const membership = await authedDb.membership.findFirst({
    where: { userId: user.id },
  });

  if (membership) {
    return;
  }

  const baseName = user.name?.trim() || user.email.split("@")[0] || "workspace";
  const slug = `${slugify(baseName)}-${user.id.slice(0, 6)}`;

  await authedDb.organization.create({
    data: {
      name: `${baseName}'s Workspace`,
      slug,
      createdById: user.id,
      memberships: {
        create: [
          {
            userId: user.id,
            role: "OWNER",
          },
        ],
      },
    },
  });
}
