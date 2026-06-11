import * as React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/format";
import type { ReviewWithAuthor } from "@/types/domain";
import { useLocationReviews } from "./api";
import { RatingStars } from "./RatingStars";

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

/** Bloco de avaliações da unidade (grid 2-col + modal "ver todas"). Some sem reviews. */
export function ReviewsBlock({
  locationId,
  totalCount,
}: {
  locationId: string;
  totalCount: number;
}) {
  const { data } = useLocationReviews(locationId);
  const [open, setOpen] = React.useState(false);
  const reviews = data ?? [];
  if (reviews.length === 0) return null;

  const preview = reviews.slice(0, 6);

  return (
    <section className="space-y-4">
      <h2 className="text-display-sm text-ink">Avaliações ({totalCount})</h2>
      <div className="grid grid-cols-1 gap-4 tablet:grid-cols-2">
        {preview.map((r) => (
          <ReviewCard key={r.id} r={r} />
        ))}
      </div>
      {reviews.length > preview.length && (
        <Button variant="outline" onClick={() => setOpen(true)}>
          Ver todas as {totalCount} avaliações
        </Button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Avaliações ({totalCount})</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-4">
            {reviews.map((r) => (
              <ReviewCard key={r.id} r={r} />
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
