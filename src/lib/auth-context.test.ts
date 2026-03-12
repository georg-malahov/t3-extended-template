import { describe, expect, it } from "vitest";

import { sessionToDbAuth } from "@/lib/auth-context";

describe("sessionToDbAuth", () => {
  it("maps the current session into a ZenStack auth context", () => {
    expect(
      sessionToDbAuth({
        user: {
          id: "user_123",
          email: "user@example.com",
          name: "Ada Lovelace",
        },
      }),
    ).toEqual({
      id: "user_123",
      email: "user@example.com",
      name: "Ada Lovelace",
    });
  });

  it("returns undefined for anonymous requests", () => {
    expect(sessionToDbAuth(null)).toBeUndefined();
  });
});
