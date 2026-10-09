/**
 * Trimestres de l'année scolaire (Algérie) :
 * - T1 : de fin septembre à décembre
 * - T2 : de janvier à fin mars
 * - T3 : d'avril à juin (le reste de l'année scolaire, juillet-août, reste en T3)
 */
export function trimesterOf(dateKey: string): "1" | "2" | "3" {
  const m = Number(dateKey.slice(5, 7));
  if (m >= 9 && m <= 12) return "1";
  if (m >= 1 && m <= 3) return "2";
  return "3";
}

export const TRIMESTER_OPTIONS = [
  { value: "1", label: "الثلاثي الأول" },
  { value: "2", label: "الثلاثي الثاني" },
  { value: "3", label: "الثلاثي الثالث" },
] as const;
