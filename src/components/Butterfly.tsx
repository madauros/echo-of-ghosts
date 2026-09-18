/**
 * Pure-CSS butterfly. All styling lives in src/styles.css (.butterfly-*).
 */
export function Butterfly({ className = "" }: { className?: string }) {
  return (
    <span className={`butterfly ${className}`} role="img" aria-label="فراشة">
      <span className="butterfly-wing butterfly-wing-right" />
      <span className="butterfly-wing butterfly-wing-left" />
      <span className="butterfly-body" />
      <span className="butterfly-antenna butterfly-antenna-right" />
      <span className="butterfly-antenna butterfly-antenna-left" />
    </span>
  );
}
