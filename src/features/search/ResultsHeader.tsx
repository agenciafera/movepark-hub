import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatDateTime, formatDuration } from "@/lib/format";
import type { SearchResponse, SearchSort } from "./useSearchResults";

type Props = {
  data: SearchResponse | undefined;
  isLoading: boolean;
  from: Date | null;
  to: Date | null;
  /** true quando as datas são um período padrão (usuário chegou sem escolher). */
  datesAreEstimate?: boolean;
  sort: SearchSort;
  onSortChange: (s: SearchSort) => void;
  /** true quando o destino tem coordenadas — habilita ordenação por distância. */
  hasDestCoords?: boolean;
};

export function ResultsHeader({
  data,
  isLoading,
  from,
  to,
  datesAreEstimate,
  sort,
  onSortChange,
  hasDestCoords,
}: Props) {
  const destName = data?.destination?.name ?? data?.destination?.code ?? "destino";
  const count = data?.total ?? 0;
  // A edição da busca (destino/datas/veículo) acontece no SearchBarPill acima — aqui é só o
  // resumo do resultado + ordenação.
  return (
    <div className="flex flex-col gap-3 tablet:flex-row tablet:items-end tablet:justify-between">
      <div className="space-y-1">
        <h1 className="text-display-md text-ink">
          {isLoading ? "Buscando…" : `${count} ${count === 1 ? "vaga" : "vagas"} em ${destName}`}
        </h1>
        {from && to && (
          <div className="flex flex-wrap items-center gap-2 text-body-sm text-muted">
            {datesAreEstimate && (
              <span className="rounded-sm bg-surface-soft px-1.5 py-0.5 text-caption font-medium text-muted-steel">
                Estimativa
              </span>
            )}
            <span>{formatDateTime(from)} → {formatDateTime(to)}</span>
            <span className="hidden tablet:inline">·</span>
            <span>{formatDuration(from, to)}</span>
          </div>
        )}
      </div>
      <div className="flex items-center gap-2">
        <Select value={sort} onValueChange={(s) => onSortChange(s as SearchSort)}>
          <SelectTrigger className="h-10 w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="price_asc">Menor preço</SelectItem>
            <SelectItem value="price_desc">Maior preço</SelectItem>
            <SelectItem value="rating_desc">Melhor avaliação</SelectItem>
            {hasDestCoords && (
              <SelectItem value="distance_asc">Mais próximo</SelectItem>
            )}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
