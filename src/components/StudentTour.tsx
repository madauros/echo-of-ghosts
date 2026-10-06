import { useEffect, useLayoutEffect, useState } from "react";

export type TourStep<K extends string> = { key: K; title: string; text: string };

const MAX_LOGINS = 10;

/** Counts one connection per browser session; tour shows during the first 10. */
export function useTourEligible(userId: string) {
  const [eligible, setEligible] = useState(false);
  useEffect(() => {
    const countKey = `tour:count:${userId}`;
    const sessKey = `tour:session:${userId}`;
    let count = Number(localStorage.getItem(countKey) ?? "0");
    if (!sessionStorage.getItem(sessKey)) {
      count += 1;
      localStorage.setItem(countKey, String(count));
      sessionStorage.setItem(sessKey, "1");
    }
    const dismissed = sessionStorage.getItem(`tour:done:${userId}`);
    const disabledForever = localStorage.getItem(`tour:disabled:${userId}`);
    setEligible(count <= MAX_LOGINS && !dismissed && !disabledForever);
  }, [userId]);
  const close = () => {
    sessionStorage.setItem(`tour:done:${userId}`, "1");
    setEligible(false);
  };
  const disable = () => {
    localStorage.setItem(`tour:disabled:${userId}`, "1");
    setEligible(false);
  };
  return { eligible, close, disable };
}

export function StudentTour<K extends string>({
  steps,
  onStep,
  onClose,
  onDisable,
  initialStep,
}: {
  steps: TourStep<K>[];
  onStep: (key: K) => void;
  onClose: () => void;
  onDisable?: () => void;
  initialStep?: K;
}) {
  const [i, setI] = useState(() => Math.max(0, steps.findIndex((item) => item.key === initialStep)));
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const step = steps[i] ?? steps[0];

  useEffect(() => {
    if (step) onStep(step.key);
  }, [step?.key]); // eslint-disable-line react-hooks/exhaustive-deps

  useLayoutEffect(() => {
    const place = () => {
      if (!step) return;
      const el = document.querySelector<HTMLElement>(`[data-tour="${step.key}"]`);
      if (!el) return setPos(null);
      el.scrollIntoView({ block: "nearest", inline: "center" });
      const r = el.getBoundingClientRect();
      const w = Math.min(300, window.innerWidth - 24);
      const left = Math.max(12, Math.min(r.left + r.width / 2 - w / 2, window.innerWidth - w - 12));
      setPos({ top: r.bottom + 12, left });
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [step?.key]);

  const last = i === steps.length - 1;

  if (!step) return null;

  return (
    <div className="fixed inset-0 z-50 bg-foreground/30" dir="rtl">
      <div
        role="dialog"
        aria-live="polite"
        className="absolute rounded-2xl border border-border bg-card p-4 text-start shadow-xl"
        style={{
          width: "min(300px, calc(100vw - 24px))",
          top: pos?.top ?? "50%",
          left: pos?.left ?? "50%",
          transform: pos ? undefined : "translate(-50%, -50%)",
        }}
      >
        <div className="mb-1 flex items-center justify-between gap-2">
          <h3 className="font-semibold text-foreground">{step.title}</h3>
          <span className="text-xs text-muted-foreground">
            {i + 1} / {steps.length}
          </span>
        </div>
        <p className="text-sm leading-relaxed text-muted-foreground">{step.text}</p>
        <div className="mt-4 flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-2">
            <button type="button" className="btn-text whitespace-nowrap text-sm" onClick={onClose}>
              تخطي
            </button>
            <div className="flex gap-2">
              {i > 0 ? (
                <button type="button" className="btn-text whitespace-nowrap text-sm" onClick={() => setI(i - 1)}>
                  السابق
                </button>
              ) : null}
              <button
                type="button"
                className="whitespace-nowrap rounded-full bg-primary px-4 py-1.5 text-sm font-semibold text-primary-foreground"
                onClick={() => (last ? onClose() : setI(i + 1))}
              >
                {last ? "فهمت" : "التالي"}
              </button>
            </div>
          </div>
          {onDisable ? (
            <button
              type="button"
              className="btn-text w-fit whitespace-nowrap text-xs text-muted-foreground"
              onClick={onDisable}
            >
              عدم العرض مرة أخرى
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
