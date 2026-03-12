import type { DbAuthContext } from "@/lib/db";

type SessionLike = {
  user: {
    id: string;
    email: string;
    name?: string | null;
  };
} | null;

export function sessionToDbAuth(session: SessionLike): DbAuthContext | undefined {
  if (!session) {
    return undefined;
  }

  return {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name ?? null,
  };
}
