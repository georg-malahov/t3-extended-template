import { beforeEach, describe, expect, it, vi } from "vitest";

const adminDb = vi.hoisted(() => ({
  user: { upsert: vi.fn() },
  membership: { findFirst: vi.fn() },
  organization: { create: vi.fn() },
}));

vi.mock("@/lib/admin-db", () => ({ adminDb }));

import { provisionWorkspaceForUser, slugify, workspaceDefaults } from "@/lib/provisioning";

describe("slugify", () => {
  it("lowercases, collapses non-alphanumerics and trims dashes", () => {
    expect(slugify("  Jane Doe's  Team! ")).toBe("jane-doe-s-team");
  });

  it("caps the slug at 32 characters", () => {
    expect(slugify("a".repeat(50))).toHaveLength(32);
  });
});

describe("workspaceDefaults", () => {
  it("uses the name when present", () => {
    expect(workspaceDefaults({ id: "abcdef123", email: "x@y.z", name: "Jane" })).toEqual({
      name: "Jane's Workspace",
      slug: "jane-abcdef",
    });
  });

  it("falls back to the email local part, and to 'workspace' for an unsluggable name", () => {
    expect(workspaceDefaults({ id: "u12345", email: "john.smith@example.com" }).slug).toBe("john-smith-u12345");
    expect(workspaceDefaults({ id: "u12345", email: "a@b.c", name: "Иван" }).slug).toBe("workspace-u12345");
  });
});

describe("provisionWorkspaceForUser", () => {
  beforeEach(() => vi.clearAllMocks());

  const user = { id: "user123456", email: "jane@example.com", name: "Jane" };

  it("mirrors the user and creates their workspace with them as OWNER, via the admin client", async () => {
    adminDb.membership.findFirst.mockResolvedValue(null);

    await provisionWorkspaceForUser(user);

    expect(adminDb.user.upsert).toHaveBeenCalledWith({
      where: { id: user.id },
      update: { email: user.email, name: "Jane" },
      create: { id: user.id, email: user.email, name: "Jane" },
    });
    expect(adminDb.organization.create).toHaveBeenCalledWith({
      data: {
        name: "Jane's Workspace",
        slug: "jane-user12",
        createdById: user.id,
        memberships: { create: [{ userId: user.id, role: "OWNER" }] },
      },
    });
  });

  it("does not create a second workspace once the user has a membership", async () => {
    adminDb.membership.findFirst.mockResolvedValue({ id: "m1" });

    await provisionWorkspaceForUser(user);

    expect(adminDb.user.upsert).toHaveBeenCalledTimes(1);
    expect(adminDb.organization.create).not.toHaveBeenCalled();
  });
});
