import { useState } from "react";
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
import { shiftDay, toDateKey } from "./useAgenda";

/** Mois en arabe (usage maghrébin). */
export const MONTHS_AR = [
  "جانفي",
  "فيفري",
  "مارس",
  "أفريل",
  "ماي",
  "جوان",
  "جويلية",
  "أوت",
  "سبتمبر",
  "أكتوبر",
  "نوفمبر",
  "ديسمبر",
];

const WEEKDAYS_AR = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

export function parseKey(key: string) {
  const [y, m, d] = key.split("-").map(Number);
  return { y: y ?? 1970, m: (m ?? 1) - 1, d: d ?? 1 };
}

export function formatDayLabelAr(key: string) {
  const { y, m, d } = parseKey(key);
  const date = new Date(y, m, d);
  return `${WEEKDAYS_AR[date.getDay()]} ${d} ${MONTHS_AR[m]} ${y}`;
}

export function AgendaCalendar({
  value,
  onChange,
  counts,
}: {
  value: string;
  onChange: (key: string) => void;
  /** clé jour -> nombre d'entrées, pour marquer les jours chargés */
  counts?: Record<string, number>;
}) {
  const { y, m } = parseKey(value);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"days" | "months" | "years">("days");
  const [viewYear, setViewYear] = useState(y);
  const [viewMonth, setViewMonth] = useState(m);

  const today = toDateKey(new Date());
  const firstWeekday = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  const pick = (day: number) => {
    onChange(toDateKey(new Date(viewYear, viewMonth, day)));
    setOpen(false);
    setView("days");
  };

  const openPicker = () => {
    setViewYear(y);
    setViewMonth(m);
    setView("days");
    setOpen((o) => !o);
  };

  const yearStart = viewYear - (((viewYear % 12) + 12) % 12);

  return (
    <div className="relative">
      <div className="flex items-center justify-between gap-2 rounded-2xl border border-border bg-card p-2">
        {/* flèche gauche = jour suivant en RTL */}
        <button
          type="button"
          aria-label="اليوم السابق"
          className="nav-menu-item"
          onClick={() => onChange(shiftDay(value, -1))}
        >
          <ChevronRight size={18} />
        </button>

        <button
          type="button"
          onClick={openPicker}
          className="flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-foreground hover:bg-muted"
        >
          <CalendarDays size={16} />
          {formatDayLabelAr(value)}
        </button>

        <button
          type="button"
          aria-label="اليوم التالي"
          className="nav-menu-item"
          onClick={() => onChange(shiftDay(value, 1))}
        >
          <ChevronLeft size={18} />
        </button>
      </div>

      <div className="mt-2 flex justify-center">
        <button type="button" className="btn-text text-xs" onClick={() => onChange(today)}>
          اليوم
        </button>
      </div>

      {open ? (
        <div className="absolute inset-x-0 z-20 mt-2 rounded-2xl border border-border bg-card p-3 shadow-lg">
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              aria-label="السابق"
              className="nav-menu-item"
              onClick={() => {
                if (view === "days") {
                  const d = new Date(viewYear, viewMonth - 1, 1);
                  setViewYear(d.getFullYear());
                  setViewMonth(d.getMonth());
                } else if (view === "months") setViewYear(viewYear - 1);
                else setViewYear(viewYear - 12);
              }}
            >
              <ChevronRight size={18} />
            </button>

            <div className="flex gap-2">
              {view === "days" ? (
                <button type="button" className="btn-text text-sm" onClick={() => setView("months")}>
                  {MONTHS_AR[viewMonth]}
                </button>
              ) : null}
              <button type="button" className="btn-text text-sm" onClick={() => setView("years")}>
                {viewYear}
              </button>
            </div>

            <button
              type="button"
              aria-label="التالي"
              className="nav-menu-item"
              onClick={() => {
                if (view === "days") {
                  const d = new Date(viewYear, viewMonth + 1, 1);
                  setViewYear(d.getFullYear());
                  setViewMonth(d.getMonth());
                } else if (view === "months") setViewYear(viewYear + 1);
                else setViewYear(viewYear + 12);
              }}
            >
              <ChevronLeft size={18} />
            </button>
          </div>

          {view === "days" ? (
            <div className="mt-3 grid grid-cols-7 gap-1 text-center text-xs">
              {WEEKDAYS_AR.map((w) => (
                <div key={w} className="py-1 text-muted-foreground">
                  {w.slice(0, 3)}
                </div>
              ))}
              {cells.map((day, i) => {
                if (day === null) return <div key={`e${i}`} />;
                const key = toDateKey(new Date(viewYear, viewMonth, day));
                const selected = key === value;
                const isToday = key === today;
                const count = counts?.[key] ?? 0;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => pick(day)}
                    className={`relative rounded-lg py-2 text-sm hover:bg-muted ${
                      selected
                        ? "bg-primary font-bold text-primary-foreground hover:bg-primary"
                        : isToday
                          ? "border border-primary text-foreground"
                          : "text-foreground"
                    }`}
                  >
                    {day}
                    {count > 0 && !selected ? (
                      <span className="absolute inset-x-0 bottom-1 mx-auto block h-1 w-1 rounded-full bg-primary" />
                    ) : null}
                  </button>
                );
              })}
            </div>
          ) : view === "months" ? (
            <div className="mt-3 grid grid-cols-3 gap-2">
              {MONTHS_AR.map((label, idx) => (
                <button
                  key={label}
                  type="button"
                  className={`rounded-lg py-2 text-sm hover:bg-muted ${
                    idx === viewMonth ? "bg-primary font-bold text-primary-foreground" : "text-foreground"
                  }`}
                  onClick={() => {
                    setViewMonth(idx);
                    setView("days");
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          ) : (
            <div className="mt-3 grid grid-cols-3 gap-2">
              {Array.from({ length: 12 }, (_, i) => yearStart + i).map((yr) => (
                <button
                  key={yr}
                  type="button"
                  className={`rounded-lg py-2 text-sm hover:bg-muted ${
                    yr === viewYear ? "bg-primary font-bold text-primary-foreground" : "text-foreground"
                  }`}
                  onClick={() => {
                    setViewYear(yr);
                    setView("months");
                  }}
                >
                  {yr}
                </button>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
