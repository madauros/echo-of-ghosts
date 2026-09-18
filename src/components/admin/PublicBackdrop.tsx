import type { ReactNode } from "react";
import doodleBg from "@/assets/math-doodle-bg.jpg";

/**
 * Fond léger style "Padlet" pour les espaces déconnectés :
 * motif de doodles de maths pastel en mosaïque + voile blanc
 * pour garder le contenu lisible.
 */
export function PublicBackdrop({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-screen">
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-0 opacity-70"
        style={{
          backgroundImage: `url(${doodleBg})`,
          backgroundRepeat: "repeat",
          backgroundSize: "704px 384px",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-0 bg-background/55"
      />
      <div className="relative z-10">{children}</div>
    </div>
  );
}
