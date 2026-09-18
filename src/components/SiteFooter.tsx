import { Link } from "@tanstack/react-router";

const LINKS = [
  { to: "/", label: "الرئيسية" },
  { to: "/talameed", label: "فضاء التلاميذ" },
  { to: "/taleem", label: "فضاء التعليم" },
  { to: "/admin", label: "فضاء الإدارة" },
] as const;

function Wordmark() {
  return (
    <Link to="/" dir="ltr" className="font-wordmark text-2xl tracking-tight">
      {"madauros".split("").map((l, i) => (
        <span key={`${l}-${i}`} className={i < 4 ? "text-brand-green" : "text-brand-red"}>
          {l}
        </span>
      ))}
    </Link>
  );
}

export function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="mt-auto border-t border-border/60 bg-background/70 backdrop-blur">
      <div className="mx-auto w-full max-w-5xl px-4 py-6 text-sm">
        <div className="flex flex-col items-center gap-4 lg:flex-row lg:items-center lg:justify-between">
          <Wordmark />

          {/* Links: single row, desktop only (hidden on mobile and tablet) */}
          <nav
            aria-label="روابط الموقع"
            className="hidden items-center gap-8 lg:flex"
          >
            {LINKS.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className="whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>

        <p className="mt-6 border-t border-border/60 pt-4 text-center text-muted-foreground">
          © {year} مداوروس — Madauros. جميع الحقوق محفوظة.
        </p>
      </div>
    </footer>
  );
}
