import { ArrowDownUp, SlidersHorizontal, ThumbsUp, User, X } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { onboardingStatusLabel } from "./status";
import {
  activeAdvancedCount,
  distinctResponsaveis,
  type PartnersFilters as Filters,
  type PartnersSort,
} from "./partnersFilters.logic";
import type { PartnerApplication } from "@/types/domain";

type Props = {
  apps: PartnerApplication[];
  filters: Filters;
  onChange: (patch: Partial<Filters>) => void;
  resultCount: number;
};

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "all", label: "Todos os status" },
  { value: "pending_review", label: onboardingStatusLabel.pending_review },
  { value: "in_progress", label: onboardingStatusLabel.in_progress },
  { value: "approved", label: onboardingStatusLabel.approved },
  { value: "active", label: onboardingStatusLabel.active },
  { value: "rejected", label: "Perdido" },
];

const SORT_OPTIONS: { value: PartnersSort; label: string }[] = [
  { value: "recent", label: "Criadas por último" },
  { value: "oldest", label: "Criadas primeiro" },
  { value: "spots_desc", label: "Mais vagas" },
  { value: "name_asc", label: "Nome (A-Z)" },
];

function fmtBR(d: string): string {
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

function Chip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-surface-soft px-2 py-1 text-caption text-ink">
      {label}
      <button
        type="button"
        aria-label={`Remover filtro ${label}`}
        onClick={onRemove}
        className="text-muted hover:text-ink"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </span>
  );
}

export function PartnersFilters({ apps, filters, onChange, resultCount }: Props) {
  const responsaveis = distinctResponsaveis(apps);
  const advCount = activeAdvancedCount(filters);

  const statusLabel = (s: string) =>
    STATUS_OPTIONS.find((o) => o.value === s)?.label ?? s;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={filters.responsavel}
          onValueChange={(v) => onChange({ responsavel: v })}
        >
          <SelectTrigger className="w-auto min-w-[13rem] gap-2 rounded-full">
            <User className="h-4 w-4 text-muted" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as negociações</SelectItem>
            {responsaveis.map((r) => (
              <SelectItem key={r} value={r}>
                {r}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filters.status} onValueChange={(v) => onChange({ status: v })}>
          <SelectTrigger className="w-auto min-w-[11rem] gap-2 rounded-full">
            <ThumbsUp className="h-4 w-4 text-muted" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filters.sort}
          onValueChange={(v) => onChange({ sort: v as PartnersSort })}
        >
          <SelectTrigger className="w-auto min-w-[12rem] gap-2 rounded-full">
            <ArrowDownUp className="h-4 w-4 text-muted" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SORT_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2 rounded-full">
              <SlidersHorizontal className="h-4 w-4" />
              Filtros{advCount > 0 ? ` (${advCount})` : ""}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80 space-y-4">
            <div className="space-y-1.5">
              <Label>Data de criação</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="date"
                  aria-label="De"
                  className="h-10 min-w-0 flex-1 px-3 text-body-sm"
                  value={filters.dateFrom ?? ""}
                  onChange={(e) => onChange({ dateFrom: e.target.value || null })}
                />
                <span className="shrink-0 text-caption text-muted">até</span>
                <Input
                  type="date"
                  aria-label="Até"
                  className="h-10 min-w-0 flex-1 px-3 text-body-sm"
                  value={filters.dateTo ?? ""}
                  onChange={(e) => onChange({ dateTo: e.target.value || null })}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="filtro-cidade">Cidade ou UF</Label>
              <Input
                id="filtro-cidade"
                className="h-10 px-3 text-body-sm"
                placeholder="Ex: São Paulo"
                value={filters.city}
                onChange={(e) => onChange({ city: e.target.value })}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="filtro-vagas">Vagas mínimas</Label>
              <Input
                id="filtro-vagas"
                type="number"
                min={0}
                className="h-10 px-3 text-body-sm"
                placeholder="Ex: 50"
                value={filters.minSpots ?? ""}
                onChange={(e) =>
                  onChange({ minSpots: e.target.value ? Number(e.target.value) : null })
                }
              />
            </div>

            {advCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-auto self-start px-0"
                onClick={() => onChange({ city: "", minSpots: null, dateFrom: null, dateTo: null })}
              >
                Limpar filtros avançados
              </Button>
            )}
          </PopoverContent>
        </Popover>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-md bg-surface-soft px-2 py-1 text-caption font-medium text-ink">
          {resultCount} {resultCount === 1 ? "solicitação" : "solicitações"}
        </span>
        {filters.responsavel !== "all" && (
          <Chip label={filters.responsavel} onRemove={() => onChange({ responsavel: "all" })} />
        )}
        {filters.status !== "all" && (
          <Chip
            label={statusLabel(filters.status)}
            onRemove={() => onChange({ status: "all" })}
          />
        )}
        {(filters.dateFrom || filters.dateTo) && (
          <Chip
            label={`Criação: ${filters.dateFrom ? fmtBR(filters.dateFrom) : "início"} a ${
              filters.dateTo ? fmtBR(filters.dateTo) : "hoje"
            }`}
            onRemove={() => onChange({ dateFrom: null, dateTo: null })}
          />
        )}
        {filters.city.trim() && (
          <Chip label={`Cidade: ${filters.city}`} onRemove={() => onChange({ city: "" })} />
        )}
        {filters.minSpots != null && (
          <Chip label={`Vagas a partir de ${filters.minSpots}`} onRemove={() => onChange({ minSpots: null })} />
        )}
      </div>
    </div>
  );
}
