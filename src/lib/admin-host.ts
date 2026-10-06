/**
 * The admin space relies on privileged server actions (reset a password,
 * change an email, delete an account) that need the backend service key.
 * That key only exists on the Lovable-hosted deployment, so on any other
 * host (Vercel, custom domains pointing at Vercel) the admin space is
 * redirected to the Lovable deployment instead of failing at runtime.
 */
export const ADMIN_APP_ORIGIN = "https://madaure.lovable.app";

/** Hosts where the privileged backend key is available. */
function isAdminCapableHost(host: string): boolean {
  return (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host.endsWith(".lovable.app") ||
    host.endsWith(".lovable.dev") ||
    host.endsWith(".lovableproject.com")
  );
}

/**
 * Returns the URL the browser should be sent to for the admin space, or
 * null when the current host can run the admin space itself.
 */
export function externalAdminUrl(path = "/admin"): string | null {
  if (typeof window === "undefined") return null;
  if (isAdminCapableHost(window.location.hostname)) return null;
  return `${ADMIN_APP_ORIGIN}${path}`;
}
