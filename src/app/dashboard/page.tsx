import { DashboardShell } from "@/components/layout/dashboard-shell";
import { ProjectsView } from "@/components/projects/projects-view";
import { sessionToDbAuth } from "@/lib/auth-context";
import { bindDbAuth } from "@/lib/db";
import { provisionWorkspaceForUser } from "@/lib/provisioning";
import { requireSession } from "@/lib/session";

export default async function DashboardPage() {
  const session = await requireSession();
  const authContext = sessionToDbAuth(session);

  if (!authContext) {
    return null;
  }

  const authedDb = bindDbAuth(authContext);
  let memberships = await authedDb.membership.findMany({
    where: { userId: session.user.id },
    include: { organization: true },
    orderBy: { createdAt: "asc" },
  });

  if (memberships.length === 0) {
    await provisionWorkspaceForUser({
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
    });

    memberships = await authedDb.membership.findMany({
      where: { userId: session.user.id },
      include: { organization: true },
      orderBy: { createdAt: "asc" },
    });
  }

  const organization = memberships[0]?.organization;

  if (!organization) {
    throw new Error("No organization available for the current user.");
  }

  return (
    <DashboardShell
      orgName={organization.name}
      userName={session.user.name || session.user.email}
    >
      <ProjectsView organizationId={organization.id} userId={session.user.id} />
    </DashboardShell>
  );
}
