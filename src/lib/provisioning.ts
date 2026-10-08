import { adminDb } from "@/lib/admin-db";

export function slugify(input: string) {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
}

export function workspaceDefaults(user: { id: string; email: string; name?: string | null }) {
  const baseName = user.name?.trim() || user.email.split("@")[0] || "workspace";
  return {
    name: `${baseName}'s Workspace`,
    slug: `${slugify(baseName) || "workspace"}-${user.id.slice(0, 6)}`,
  };
}

/**
 * Mirrors the Better Auth account into public.User and, on first call, creates
 * the user's own workspace with them as OWNER.
 *
 * Server-only: called from the Better Auth sign-up hook and the dashboard with
 * the id/email/name of the SESSION user — never with request input. It writes
 * through the policy-free `adminDb`, because the schema forbids these writes
 * through the policy client (and therefore through `/api/model`): otherwise
 * any signed-in user could create a membership in someone else's workspace.
 */
export async function provisionWorkspaceForUser(user: {
  id: string;
  email: string;
  name?: string | null;
}) {
  await adminDb.user.upsert({
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

  const membership = await adminDb.membership.findFirst({
    where: { userId: user.id },
  });

  if (membership) {
    return;
  }

  // Organization + OWNER membership in one statement (one transaction).
  await adminDb.organization.create({
    data: {
      ...workspaceDefaults(user),
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
