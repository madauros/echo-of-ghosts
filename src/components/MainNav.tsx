import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { getSpaceClient, type SpaceKey } from "@/lib/spaces";

const SPACE_ITEMS: { to: string; label: string; hint: string }[] = [
  { to: "/", label: "فضاء التلاميذ", hint: "talameed" },
  { to: "/taleem", label: "فضاء الأساتذة", hint: "taleem" },
  { to: "/admin", label: "فضاء الإدارة", hint: "admin" },
];

interface Props {
  /** Active space accent for the current page */
  space?: SpaceKey;
  /** When provided, a "تسجيل الخروج" button replaces the login link */
  onSignOut?: (() => void) | undefined;
}

export function MainNav({ space, onSignOut }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);

  useEffect(() => {
    if (onSignOut) {
      setLoggedIn(true);
      return;
    }
    if (!space) return;
    getSpaceClient(space)
      .auth.getSession()
      .then(({ data }) => setLoggedIn(Boolean(data.session)));
  }, [space, onSignOut]);

  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-border bg-card/80 backdrop-blur-md">
      <nav className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between gap-4 px-4">
        {/* Brand + spaces dropdown grouped at the start */}
        <div className="flex items-center gap-3">
          {/* Wordmark */}
          <Link to="/" dir="ltr" className="font-wordmark text-xl tracking-tight">
            {"madauros".split("").map((l, i) => (
              <span key={`${l}-${i}`} className={i < 4 ? "text-brand-green" : "text-brand-red"}>
                {l}
              </span>
            ))}
          </Link>

          {/* Spaces dropdown — sits to the left of the logo in RTL flow */}
          <div className="relative text-sm">
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              aria-expanded={menuOpen}
              aria-haspopup="menu"
              className="flex items-center gap-1 rounded-full px-3 py-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              الفضاءات
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className={`transition-transform ${menuOpen ? "rotate-180" : ""}`}
              >
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>
            {menuOpen ? (
              <div
                role="menu"
                className="absolute start-0 top-full mt-2 w-52 overflow-hidden rounded-2xl border border-border bg-card p-1 shadow-lg"
              >
                {SPACE_ITEMS.map((item) => (
                  <Link
                    key={item.to}
                    to={item.to}
                    role="menuitem"
                    onClick={() => setMenuOpen(false)}
                    className="flex items-center justify-between rounded-xl px-3 py-2 text-foreground transition-colors hover:bg-muted"
                  >
                    <span>{item.label}</span>
                    <span dir="ltr" className="text-xs text-muted-foreground">
                      {item.hint}
                    </span>
                  </Link>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        {/* Auth action */}
        {loggedIn && onSignOut ? (
          <button type="button" onClick={onSignOut} className="btn-text text-sm">
            تسجيل الخروج
          </button>
        ) : (
          <Link
            to={space === "taleem" ? "/taleem" : space === "admin" ? "/admin" : "/"}
            className="btn-primary text-sm"
          >
            تسجيل الدخول
          </Link>
        )}
      </nav>
    </header>
  );
}
