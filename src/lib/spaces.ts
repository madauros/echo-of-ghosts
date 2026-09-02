import type { Database } from "@/integrations/supabase/types";

export type AppSpace = Database["public"]["Enums"]["app_space"];
export type AccountStatus = Database["public"]["Enums"]["account_status"];
export type Profile = Database["public"]["Tables"]["profiles"]["Row"];

export type SpaceConfig = {
  space: AppSpace;
  path: "/eleves" | "/enseignants" | "/administration";
  label: string;
  tagline: string;
  description: string;
};

export const SPACES: SpaceConfig[] = [
  {
    space: "eleve",
    path: "/eleves",
    label: "Espace élèves",
    tagline: "Réviser, rendre, progresser",
    description:
      "Consultez les cours et exercices de votre niveau, déposez vos réponses et suivez vos notes et l'agenda de la classe.",
  },
  {
    space: "enseignant",
    path: "/enseignants",
    label: "Espace enseignants",
    tagline: "Publier, corriger, planifier",
    description:
      "Déposez vos cours et exercices, corrigez et notez les rendus de vos élèves, planifiez devoirs et évaluations.",
  },
  {
    space: "admin",
    path: "/administration",
    label: "Espace administration",
    tagline: "Valider, organiser, affecter",
    description:
      "Validez les inscriptions, gérez niveaux et classes, affectez les élèves et les enseignants.",
  },
];

export const SPACE_LABEL: Record<AppSpace, string> = {
  eleve: "Élève",
  enseignant: "Enseignant",
  admin: "Administration",
};

export const STATUS_LABEL: Record<AccountStatus, string> = {
  pending: "En attente",
  approved: "Approuvé",
  rejected: "Refusé",
};

export function spaceConfig(space: AppSpace): SpaceConfig {
  return SPACES.find((entry) => entry.space === space)!;
}
