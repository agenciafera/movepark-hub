import * as React from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/format";
import type { ReviewWithAuthor } from "@/types/domain";
import { useLocationReviews } from "./api";
import { RatingStars } from "./RatingStars";
import { type ReviewSort, sortReviews } from "./reviews.logic";

const PAGE_SIZE = 6;

function ReviewCard({ r }: { r: ReviewWithAuthor }) {
  return (
    <div className="rounded-md border border-hairline bg-canvas p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-body-sm font-medium text-ink">{r.author_name ?? "Cliente Movepark"}</span>
        <RatingStars value={r.rating} size="sm" />
      </div>
      <p className="text-caption text-muted">{formatDate(r.created_at)}</p>
      {r.comment && <p className="mt-2 text-body-sm text-ink">{r.comment}</p>}
      {r.owner_response && (
        <div className="mt-3 rounded-sm bg-surface-soft p-3">
          <p className="text-caption font-bold uppercase tracking-[0.4px] text-muted-steel">
            Resposta do estabelecimento
          </p>
          <p className="mt-0.5 text-body-sm text-ink">{r.owner_response}</p>
        </div>
      )}
    </div>
  );
}

const SORT_OPTIONS: { value: ReviewSort; label: string }[] = [
  { value: "recent", label: "Mais recentes" },
  { value: "best", label: "Melhor avaliadas" },
];

/** Bloco de avaliações da unidade (grid 2-col, ordenável e paginado). Some sem reviews. */
export function ReviewsBlock({
  locationId,
  totalCount,
}: {
  locationId: string;
  totalCount: number;
}) {
  const { data } = useLocationReviews(locationId);
  const [sort, setSort] = React.useState<ReviewSort>("recent");
  const [visible, setVisible] = React.useState(PAGE_SIZE);
  const reviews = React.useMemo(() => data ?? [], [data]);

  const sorted = React.useMemo(() => sortReviews(reviews, sort), [reviews, sort]);

  if (reviews.length === 0) return null;

  const shown = sorted.slice(0, visible);

  return (
    <section id="avaliacoes" className="scroll-mt-24 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-display-sm text-ink">Avaliações ({totalCount})</h2>
        {reviews.length > 1 && (
          <div className="flex gap-1" role="group" aria-label="Ordenar avaliações">
            {SORT_OPTIONS.map((opt) => (
              <Button
                key={opt.value}
                variant={sort === opt.value ? "secondary" : "ghost"}
                size="sm"
                aria-pressed={sort === opt.value}
                onClick={() => {
                  setSort(opt.value);
                  setVisible(PAGE_SIZE);
                }}
                className={cn(sort === opt.value && "font-medium")}
              >
                {opt.label}
              </Button>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 tablet:grid-cols-2">
        {shown.map((r) => (
          <ReviewCard key={r.id} r={r} />
        ))}
      </div>

      {visible < sorted.length && (
        <Button variant="outline" onClick={() => setVisible((v) => v + PAGE_SIZE)}>
          Ver mais avaliações ({sorted.length - visible} restantes)
        </Button>
      )}
    </section>
  );
}
