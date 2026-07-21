import * as React from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { Review } from "@/types/domain";
import { RatingStars } from "./RatingStars";
import { useSubmitReview } from "./api";
import {
  buildSubmitReviewArgs,
  EMPTY_REVIEW_FORM,
  validateReviewForm,
  type ReviewFormValues,
} from "./reviews.logic";

type Props = {
  open: boolean;
  bookingId: string;
  locationName: string;
  existing?: Review | null;
  /** Nota pré-selecionada (deep link de 1 clique do e-mail: ?rating=N). */
  initialRating?: number;
  onOpenChange: (open: boolean) => void;
};

const CRITERIA: { key: keyof ReviewFormValues; label: string }[] = [
  { key: "cleanliness", label: "Limpeza" },
  { key: "service", label: "Atendimento" },
  { key: "value", label: "Custo-benefício" },
  { key: "access", label: "Acesso" },
];

export function ReviewForm({
  open,
  bookingId,
  locationName,
  existing,
  initialRating,
  onOpenChange,
}: Props) {
  const submit = useSubmitReview();
  const [f, setF] = React.useState<ReviewFormValues>(EMPTY_REVIEW_FORM);

  React.useEffect(() => {
    if (!open) return;
    setF(
      existing
        ? {
            rating: existing.rating,
            comment: existing.comment ?? "",
            cleanliness: existing.rating_cleanliness,
            service: existing.rating_service,
            value: existing.rating_value,
            access: existing.rating_access,
          }
        : {
            ...EMPTY_REVIEW_FORM,
            rating: initialRating && initialRating >= 1 && initialRating <= 5 ? initialRating : 0,
          },
    );
  }, [open, existing, initialRating]);

  function set<K extends keyof ReviewFormValues>(k: K, v: ReviewFormValues[K]) {
    setF((prev) => ({ ...prev, [k]: v }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const err = validateReviewForm(f);
    if (err) {
      toast.error(err);
      return;
    }
    try {
      await submit.mutateAsync(buildSubmitReviewArgs(bookingId, f));
      toast.success("Obrigado pela avaliação!");
      onOpenChange(false);
    } catch (e2) {
      toast.error(e2 instanceof Error ? e2.message : "Erro ao enviar avaliação");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Avaliar {locationName}</DialogTitle>
        </DialogHeader>
        <form className="flex flex-col gap-5" onSubmit={handleSubmit}>
          <div className="flex flex-col items-center gap-2 py-2">
            <Label id="rating-overall">Sua nota geral</Label>
            <RatingStars
              value={f.rating}
              onChange={(v) => set("rating", v)}
              size="lg"
              aria-labelledby="rating-overall"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            {CRITERIA.map((c) => (
              <div key={c.key} className="flex items-center justify-between gap-2">
                <span id={`rating-${c.key}`} className="text-body-sm text-muted">
                  {c.label}
                </span>
                <RatingStars
                  value={(f[c.key] as number | null) ?? 0}
                  onChange={(v) => set(c.key, v as ReviewFormValues[typeof c.key])}
                  size="sm"
                  aria-labelledby={`rating-${c.key}`}
                />
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="r-comment">Comentário (opcional)</Label>
            <Textarea
              id="r-comment"
              rows={4}
              value={f.comment}
              onChange={(e) => set("comment", e.target.value)}
              placeholder="Como foi sua experiência?"
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={submit.isPending}>
              {submit.isPending ? "Enviando…" : existing ? "Atualizar avaliação" : "Enviar avaliação"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
