import type { PartnerApplication } from "@/types/domain";

export type PartnersSort = "recent" | "oldest" | "spots_desc" | "name_asc";

export type PartnersFilters = {
  responsavel: string; // "all" ou nome do responsável
  status: string; // "all" ou onboarding_status
  city: string; // substring (vazio = ignora)
  minSpots: number | null; // vagas mínimas
  dateFrom: string | null; // ISO date (yyyy-mm-dd) inclusivo
  dateTo: string | null; // ISO date (yyyy-mm-dd) inclusivo
  sort: PartnersSort;
};

export const emptyPartnersFilters: PartnersFilters = {
  responsavel: "all",
  status: "all",
  city: "",
  minSpots: null,
  dateFrom: null,
  dateTo: null,
  sort: "recent",
};

// Lista de responsáveis distintos presentes nas solicitações, para o dropdown.
export function distinctResponsaveis(apps: PartnerApplication[]): string[] {
  const set = new Set<string>();
  for (const a of apps) {
    const name = a.contact_name?.trim();
    if (name) set.add(name);
  }
  return [...set].sort((x, y) => x.localeCompare(y, "pt-BR"));
}

// Conta filtros "avançados" ativos (os que ficam atrás do botão Filtros).
export function activeAdvancedCount(f: PartnersFilters): number {
  let n = 0;
  if (f.city.trim()) n += 1;
  if (f.minSpots != null) n += 1;
  if (f.dateFrom || f.dateTo) n += 1;
  return n;
}

function submittedTime(a: PartnerApplication): number {
  return a.submitted_at ? new Date(a.submitted_at).getTime() : 0;
}

export function applyPartnersFilters(
  apps: PartnerApplication[],
  f: PartnersFilters,
): PartnerApplication[] {
  const city = f.city.trim().toLowerCase();

  const filtered = apps.filter((a) => {
    if (f.responsavel !== "all" && a.contact_name !== f.responsavel) return false;
    if (f.status !== "all" && (a.company?.onboarding_status ?? "pending_review") !== f.status)
      return false;
    if (city) {
      const hay = `${a.city ?? ""} ${a.state ?? ""}`.toLowerCase();
      if (!hay.includes(city)) return false;
    }
    if (f.minSpots != null && (a.estimated_spots ?? 0) < f.minSpots) return false;
    if (f.dateFrom && (!a.submitted_at || a.submitted_at.slice(0, 10) < f.dateFrom)) return false;
    if (f.dateTo && (!a.submitted_at || a.submitted_at.slice(0, 10) > f.dateTo)) return false;
    return true;
  });

  const sorted = [...filtered];
  switch (f.sort) {
    case "recent":
      sorted.sort((a, b) => submittedTime(b) - submittedTime(a));
      break;
    case "oldest":
      sorted.sort((a, b) => submittedTime(a) - submittedTime(b));
      break;
    case "spots_desc":
      sorted.sort((a, b) => (b.estimated_spots ?? 0) - (a.estimated_spots ?? 0));
      break;
    case "name_asc":
      sorted.sort((a, b) =>
        (a.company?.name ?? "").localeCompare(b.company?.name ?? "", "pt-BR"),
      );
      break;
  }
  return sorted;
}
