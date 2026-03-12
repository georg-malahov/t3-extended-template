import { RPCApiHandler } from "@zenstackhq/server/api";
import { NextRequestHandler } from "@zenstackhq/server/next";
import type { NextRequest } from "next/server";

import { sessionToDbAuth } from "@/lib/auth-context";
import { auth } from "@/lib/auth";
import { bindDbAuth } from "@/lib/db";
import { schema } from "@/lib/zenstack/generated/schema";

const handler = NextRequestHandler({
  apiHandler: new RPCApiHandler({ schema }),
  getClient: async (request: NextRequest) => {
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    return bindDbAuth(sessionToDbAuth(session));
  },
  useAppDir: true,
});

export {
  handler as DELETE,
  handler as GET,
  handler as PATCH,
  handler as POST,
  handler as PUT,
};
