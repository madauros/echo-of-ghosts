import { createMiddleware } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { getSpaceClient, SPACES, type SpaceKey } from "@/lib/spaces";

/**
 * Each space (talameed / taleem / admin) keeps its session in its own Supabase
 * client with a distinct storage key, so the default generated attacher — which
 * only reads the shared `supabase` client — never finds a token and server
 * functions receive no bearer (they then fail as unauthorized / "Forbidden").
 *
 * Order matters: a stale session left in the shared client (or in another
 * space) would otherwise win over the space the user is actually working in,
 * and an admin action would run with a non-admin token. So: the space of the
 * current page first, then admin, then the remaining spaces, then the shared
 * client — skipping expired tokens.
 */
function currentSpaceFromPath(): SpaceKey | null {
  if (typeof window === "undefined") return null;
  const path = window.location.pathname;
  for (const key of Object.keys(SPACES) as SpaceKey[]) {
    if (path === SPACES[key].path || path.startsWith(`${SPACES[key].path}/`)) return key;
  }
  return null;
}

function isUsable(session: { access_token?: string; expires_at?: number } | null): boolean {
  if (!session?.access_token) return false;
  // Treat a token expiring within the next minute as unusable: the request
  // would otherwise reach the server just after expiry and fail as
  // "Unauthorized" (the user sees "your session ended").
  if (session.expires_at && session.expires_at * 1000 <= Date.now() + 60_000) return false;
  return true;
}

type AnyClient = { auth: { getSession: () => Promise<any>; refreshSession: () => Promise<any> } };

async function usableToken(client: AnyClient): Promise<string | undefined> {
  const { data } = await client.auth.getSession();
  if (isUsable(data?.session)) return data.session.access_token as string;
  // A stored-but-stale session can still be renewed with its refresh token.
  if (data?.session) {
    const { data: refreshed } = await client.auth.refreshSession();
    if (isUsable(refreshed?.session)) return refreshed.session.access_token as string;
  }
  return undefined;
}

export const attachSpaceAuth = createMiddleware({ type: "function" }).client(async ({ next }) => {
  let token: string | undefined;

  if (typeof window !== "undefined") {
    const current = currentSpaceFromPath();
    const candidates: SpaceKey[] = [
      ...(current ? [current] : []),
      "admin" as SpaceKey,
      ...(Object.keys(SPACES) as SpaceKey[]),
    ];
    const order = candidates.filter((s, i) => candidates.indexOf(s) === i);

    for (const space of order) {
      token = await usableToken(getSpaceClient(space) as unknown as AnyClient);
      if (token) break;
    }
  }

  if (!token) token = await usableToken(supabase as unknown as AnyClient);

  return next({ headers: token ? { Authorization: `Bearer ${token}` } : {} });
});

