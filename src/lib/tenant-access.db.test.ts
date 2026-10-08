/**
 * Tenant-isolation regression tests against a REAL Postgres (no mocks):
 *
 * - `/api/model` is exercised through the same `RPCApiHandler` the route uses,
 *   with the app's own client from `bindDbAuth()` (`src/lib/db.ts`) — so the
 *   test also proves that the policy plugin is actually wired in. Callers:
 *   anonymous, an outsider from another workspace, MEMBER, ADMIN, OWNER.
 * - Sign-up goes through Better Auth itself (`auth.handler(Request)` is
 *   exactly what `POST /api/auth/sign-up/email` runs), so the provisioning hook
 *   is the production one.
 *
 * Needs a migrated database (auth + public schema) at DATABASE_URL
 * (default postgresql://postgres@localhost/app); the whole file is skipped
 * when it is unreachable, e.g. in the DB-less CI unit job. Local run:
 *   DATABASE_URL=postgresql://postgres@localhost:5432/app bunx vitest run src/lib/tenant-access.db.test.ts
 */
import { randomBytes } from "crypto";

import { RPCApiHandler } from "@zenstackhq/server/api";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { schema } from "@/lib/zenstack/generated/schema";

const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgresql://postgres@localhost/app";
const APP_URL = "http://localhost:3000";

async function probeDb(): Promise<boolean> {
  const probe = new Pool({ connectionString: DATABASE_URL, connectionTimeoutMillis: 2000 });
  try {
    const res = await probe.query(
      `SELECT
         to_regclass('public."Membership"') IS NOT NULL AS app,
         to_regclass('auth."user"') IS NOT NULL AS auth`,
    );
    return Boolean(res.rows[0]?.app && res.rows[0]?.auth);
  } catch {
    return false;
  } finally {
    await probe.end().catch(() => {});
  }
}

const dbAvailable = await probeDb();

// env.ts validates at import — give it a complete local config BEFORE the app
// modules are imported (dynamically, in beforeAll).
Object.assign(process.env, {
  DATABASE_URL,
  APP_URL,
  BETTER_AUTH_URL: APP_URL,
  AUTH_SECRET: process.env.AUTH_SECRET ?? "tenant-access-test-secret",
  // Disables Better Auth's rate limiter for the handler calls below.
  E2E: "1",
});

const run = Date.now().toString(36) + randomBytes(3).toString("hex");
const email = (who: string) => `${who}-${run}@tenant-test.example`;
const ORG = `org-${run}`;
const OTHER_ORG = `org2-${run}`;
const IDS = {
  owner: `owner-${run}`,
  admin: `admin-${run}`,
  member: `member-${run}`,
  outsider: `outsider-${run}`,
};
type Who = keyof typeof IDS | "anon";

let pool: Pool;
let bindDbAuth: typeof import("@/lib/db").bindDbAuth;
let auth: typeof import("@/lib/auth").auth;
const rpc = new RPCApiHandler({ schema });

function clientFor(who: Who) {
  if (who === "anon") return bindDbAuth(undefined);
  return bindDbAuth({ id: IDS[who], email: email(who), name: who });
}

function call(who: Who, method: string, path: string, requestBody?: unknown) {
  return rpc.handleRequest({
    client: clientFor(who) as never,
    method,
    path,
    requestBody,
  });
}

function query(who: Who, path: string, q: unknown) {
  return rpc.handleRequest({
    client: clientFor(who) as never,
    method: "GET",
    path,
    query: { q: JSON.stringify(q) },
  });
}

async function membershipsOf(userId: string) {
  const res = await pool.query<{ role: string; organizationId: string }>(
    `SELECT role, "organizationId" FROM "Membership" WHERE "userId" = $1 ORDER BY "organizationId"`,
    [userId],
  );
  return res.rows;
}

async function userRow(id: string) {
  const res = await pool.query<{ id: string; email: string; name: string | null }>(
    `SELECT id, email, name FROM "User" WHERE id = $1`,
    [id],
  );
  return res.rows[0] ?? null;
}

describe.skipIf(!dbAvailable)("tenant isolation through /api/model (real Postgres)", () => {
  let projectId: string;

  beforeAll(async () => {
    pool = new Pool({ connectionString: DATABASE_URL });
    bindDbAuth = (await import("@/lib/db")).bindDbAuth;
    auth = (await import("@/lib/auth")).auth;

    for (const [who, id] of Object.entries(IDS)) {
      await pool.query(
        `INSERT INTO "User" (id, email, name, "createdAt", "updatedAt") VALUES ($1, $2, $3, NOW(), NOW())`,
        [id, email(who), who],
      );
    }
    await pool.query(
      `INSERT INTO "Organization" (id, name, slug, "createdById", "createdAt", "updatedAt")
       VALUES ($1, 'Workspace A', $1, $2, NOW(), NOW()), ($3, 'Workspace B', $3, $4, NOW(), NOW())`,
      [ORG, IDS.owner, OTHER_ORG, IDS.outsider],
    );
    const roles: [string, string, string][] = [
      [IDS.owner, ORG, "OWNER"],
      [IDS.admin, ORG, "ADMIN"],
      [IDS.member, ORG, "MEMBER"],
      [IDS.outsider, OTHER_ORG, "OWNER"],
    ];
    for (const [userId, organizationId, role] of roles) {
      await pool.query(
        `INSERT INTO "Membership" (id, role, "organizationId", "userId", "createdAt", "updatedAt")
         VALUES ($1, $2::"OrgRole", $3, $4, NOW(), NOW())`,
        [`m-${randomBytes(6).toString("hex")}`, role, organizationId, userId],
      );
    }
    projectId = `p-${run}`;
    await pool.query(
      `INSERT INTO "Project" (id, name, status, "organizationId", "creatorId", "createdAt", "updatedAt")
       VALUES ($1, 'Secret project', 'ACTIVE', $2, $3, NOW(), NOW())`,
      [projectId, ORG, IDS.member],
    );
  });

  afterAll(async () => {
    if (!pool) return;
    await pool.query(`DELETE FROM "Organization" WHERE id = ANY($1)`, [[ORG, OTHER_ORG]]);
    await pool.query(`DELETE FROM "Organization" WHERE "createdById" LIKE $1`, [`%${run}%`]);
    await pool.query(`DELETE FROM "User" WHERE email LIKE $1`, [`%-${run}@tenant-test.example`]);
    await pool.query(`DELETE FROM auth."user" WHERE email LIKE $1`, [`%-${run}@tenant-test.example`]);
    await pool.end();
  });

  // ── Membership: the "join any workspace as OWNER" hole ────────────────────

  it.each([
    ["create", "POST", "/membership/create", { data: { organizationId: ORG, userId: "__self__", role: "OWNER" } }],
    [
      "upsert",
      "POST",
      "/membership/upsert",
      {
        where: { organizationId_userId: { organizationId: ORG, userId: "__self__" } },
        create: { organizationId: ORG, userId: "__self__", role: "OWNER" },
        update: { role: "OWNER" },
      },
    ],
  ])("an outsider cannot join another workspace via membership %s", async (_label, method, path, body) => {
    const payload = JSON.parse(JSON.stringify(body).replaceAll("__self__", IDS.outsider));
    const res = await call("outsider", method, path, payload);
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(await membershipsOf(IDS.outsider)).toEqual([{ role: "OWNER", organizationId: OTHER_ORG }]);
  });

  it("an outsider cannot join through a nested write on their own User row", async () => {
    const res = await call("outsider", "PUT", "/user/update", {
      where: { id: IDS.outsider },
      data: { memberships: { create: { organizationId: ORG, role: "OWNER" } } },
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(await membershipsOf(IDS.outsider)).toEqual([{ role: "OWNER", organizationId: OTHER_ORG }]);
  });

  it("an outsider cannot join through the $transaction endpoint", async () => {
    const res = await call("outsider", "POST", "/$transaction/sequential", [
      { model: "Membership", op: "create", args: { data: { organizationId: ORG, userId: IDS.outsider, role: "OWNER" } } },
    ]);
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(await membershipsOf(IDS.outsider)).toEqual([{ role: "OWNER", organizationId: OTHER_ORG }]);
  });

  it.each(["member", "admin"] as const)("a %s cannot promote themself to OWNER", async (who) => {
    const before = await membershipsOf(IDS[who]);
    for (const [method, path, body] of [
      ["PUT", "/membership/update", { where: { organizationId_userId: { organizationId: ORG, userId: IDS[who] } }, data: { role: "OWNER" } }],
      ["PUT", "/membership/updateMany", { where: { userId: IDS[who] }, data: { role: "OWNER" } }],
      ["POST", "/$transaction/sequential", [{ model: "Membership", op: "updateMany", args: { where: { userId: IDS[who] }, data: { role: "OWNER" } } }]],
    ] as const) {
      await call(who, method, path, body);
    }
    expect(await membershipsOf(IDS[who])).toEqual(before);
  });

  it("an OWNER cannot add someone through a nested write on the Organization", async () => {
    const res = await call("owner", "PUT", "/organization/update", {
      where: { id: ORG },
      data: { memberships: { create: { userId: IDS.outsider, role: "OWNER" } } },
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(await membershipsOf(IDS.outsider)).toEqual([{ role: "OWNER", organizationId: OTHER_ORG }]);
  });

  it("an OWNER can remove another member, a MEMBER cannot, and nobody can remove themself", async () => {
    const victim = `victim-${run}`;
    await pool.query(
      `INSERT INTO "User" (id, email, name, "createdAt", "updatedAt") VALUES ($1, $2, 'victim', NOW(), NOW())`,
      [victim, email("victim")],
    );
    await pool.query(
      `INSERT INTO "Membership" (id, role, "organizationId", "userId", "createdAt", "updatedAt")
       VALUES ($1, 'MEMBER', $2, $3, NOW(), NOW())`,
      [`m-${randomBytes(6).toString("hex")}`, ORG, victim],
    );
    const where = (userId: string) => ({ where: { organizationId_userId: { organizationId: ORG, userId } } });

    const byMember = await rpc.handleRequest({
      client: clientFor("member") as never,
      method: "DELETE",
      path: "/membership/delete",
      query: { q: JSON.stringify(where(victim)) },
    });
    expect(byMember.status).toBeGreaterThanOrEqual(400);
    expect(await membershipsOf(victim)).toHaveLength(1);

    const self = await rpc.handleRequest({
      client: clientFor("owner") as never,
      method: "DELETE",
      path: "/membership/delete",
      query: { q: JSON.stringify(where(IDS.owner)) },
    });
    expect(self.status).toBeGreaterThanOrEqual(400);
    expect(await membershipsOf(IDS.owner)).toHaveLength(1);

    const byOwner = await rpc.handleRequest({
      client: clientFor("owner") as never,
      method: "DELETE",
      path: "/membership/delete",
      query: { q: JSON.stringify(where(victim)) },
    });
    expect(byOwner.status).toBe(200);
    expect(await membershipsOf(victim)).toEqual([]);
  });

  // ── User: cross-tenant directory + identity rewrite ───────────────────────

  it("anonymous callers read no users", async () => {
    const res = await query("anon", "/user/findMany", { where: { email: { endsWith: `${run}@tenant-test.example` } } });
    expect((res.body as { data: unknown[] }).data).toEqual([]);
  });

  it("an outsider sees only themself, not another workspace's users", async () => {
    const res = await query("outsider", "/user/findMany", { where: { email: { endsWith: `${run}@tenant-test.example` } } });
    const ids = (res.body as { data: { id: string }[] }).data.map((u) => u.id);
    expect(ids).toEqual([IDS.outsider]);
  });

  it("a MEMBER sees co-members but not their emails; OWNER/ADMIN and the user themself do", async () => {
    const read = async (who: Who) => {
      const res = await query(who, "/user/findMany", {
        where: { id: { in: [IDS.owner, IDS.member] } },
        orderBy: { id: "asc" },
      });
      return Object.fromEntries(
        (res.body as { data: { id: string; email: string | null }[] }).data.map((u) => [u.id, u.email]),
      );
    };

    expect(await read("member")).toEqual({ [IDS.owner]: null, [IDS.member]: email("member") });
    expect(await read("admin")).toEqual({ [IDS.owner]: email("owner"), [IDS.member]: email("member") });
    expect(await read("owner")).toEqual({ [IDS.owner]: email("owner"), [IDS.member]: email("member") });
  });

  it("a user can change their name but not their id or email", async () => {
    const ok = await call("member", "PUT", "/user/update", { where: { id: IDS.member }, data: { name: "Renamed" } });
    expect(ok.status).toBe(200);

    for (const data of [{ email: email("hijack") }, { id: `hijack-${run}` }]) {
      const res = await call("member", "PUT", "/user/update", { where: { id: IDS.member }, data });
      expect(res.status).toBeGreaterThanOrEqual(400);
    }
    expect(await userRow(IDS.member)).toEqual({ id: IDS.member, email: email("member"), name: "Renamed" });
  });

  it("nobody can create a User or an Organization through /api/model", async () => {
    const ghost = `ghost-${run}`;
    const userRes = await rpc.handleRequest({
      client: bindDbAuth({ id: ghost, email: email("ghost"), name: null }) as never,
      method: "POST",
      path: "/user/create",
      requestBody: { data: { id: ghost, email: email("ghost") } },
    });
    expect(userRes.status).toBeGreaterThanOrEqual(400);
    expect(await userRow(ghost)).toBeNull();

    const orgRes = await call("outsider", "POST", "/organization/create", {
      data: {
        name: "Sneaky",
        slug: `sneaky-${run}`,
        createdById: IDS.outsider,
        memberships: { create: { userId: IDS.outsider, role: "OWNER" } },
      },
    });
    expect(orgRes.status).toBeGreaterThanOrEqual(400);
    const orgs = await pool.query(`SELECT 1 FROM "Organization" WHERE slug = $1`, [`sneaky-${run}`]);
    expect(orgs.rowCount).toBe(0);
  });

  it("an OWNER can rename the workspace but not hand its createdBy to someone else", async () => {
    const ok = await call("owner", "PUT", "/organization/update", { where: { id: ORG }, data: { name: "Renamed A" } });
    expect(ok.status).toBe(200);

    const res = await call("owner", "PUT", "/organization/update", {
      where: { id: ORG },
      data: { createdById: IDS.outsider },
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
    const row = await pool.query(`SELECT "createdById" FROM "Organization" WHERE id = $1`, [ORG]);
    expect(row.rows[0].createdById).toBe(IDS.owner);
  });

  // ── Project: scoped to the workspace ──────────────────────────────────────

  it("an outsider can neither read nor write another workspace's projects", async () => {
    const read = await query("outsider", "/project/findMany", { where: { organizationId: ORG } });
    expect((read.body as { data: unknown[] }).data).toEqual([]);

    const create = await call("outsider", "POST", "/project/create", {
      data: { name: "Injected", organizationId: ORG, creatorId: IDS.outsider },
    });
    expect(create.status).toBeGreaterThanOrEqual(400);
  });

  it("a member cannot move a project into another workspace or rewrite its creator", async () => {
    for (const data of [{ organizationId: OTHER_ORG }, { creatorId: IDS.owner }]) {
      const res = await call("member", "PUT", "/project/update", { where: { id: projectId }, data });
      expect(res.status).toBeGreaterThanOrEqual(400);
    }
    const row = await pool.query(`SELECT "organizationId", "creatorId" FROM "Project" WHERE id = $1`, [projectId]);
    expect(row.rows[0]).toEqual({ organizationId: ORG, creatorId: IDS.member });

    const ok = await call("member", "PUT", "/project/update", { where: { id: projectId }, data: { status: "PAUSED" } });
    expect(ok.status).toBe(200);
  });

  it("a project cannot be created together with a new workspace (nested create)", async () => {
    const res = await call("outsider", "POST", "/project/create", {
      data: {
        name: "Nested",
        creator: { connect: { id: IDS.outsider } },
        organization: {
          create: { name: "Nested org", slug: `nested-${run}`, createdById: IDS.outsider },
        },
      },
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  // ── Provisioning still works (server-side, policy-free) ───────────────────

  it("public sign-up still provisions the user's own workspace with them as OWNER", async () => {
    const addr = email("signup");
    const res = await auth.handler(
      new Request(`${APP_URL}/api/auth/sign-up/email`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: APP_URL },
        body: JSON.stringify({ email: addr, password: "password123", name: "New User" }),
      }),
    );
    expect(res.status).toBe(200);

    const authUser = await pool.query<{ id: string }>(`SELECT id FROM auth."user" WHERE email = $1`, [addr]);
    const userId = authUser.rows[0]!.id;
    expect(await userRow(userId)).toEqual({ id: userId, email: addr, name: "New User" });

    const memberships = await membershipsOf(userId);
    expect(memberships).toHaveLength(1);
    expect(memberships[0]!.role).toBe("OWNER");

    // …and the new owner sees exactly their own workspace through the policy client.
    const orgs = await bindDbAuth({ id: userId, email: addr, name: "New User" }).organization.findMany();
    expect(orgs.map((o) => o.id)).toEqual([memberships[0]!.organizationId]);
  });
});
