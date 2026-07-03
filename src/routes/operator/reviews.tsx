import * as React from "react";
import { toast } from "sonner";
import { Star } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { formatDate } from "@/lib/format";
import { useAuth } from "@/auth/context";
import { RatingStars } from "@/features/reviews/RatingStars";
import {
  useOperatorReviews,
  useRespondReview,
  type OperatorReview,
} from "@/features/reviews/operatorApi";

function ReviewRow({ r, companyId }: { r: OperatorReview; companyId: string }) {
  const respond = useRespondReview(companyId);
  const [editing, setEditing] = React.useState(false);
  const [text, setText] = React.useState(r.owner_response ?? "");

  async function save() {
    try {
      await respond.mutateAsync({ reviewId: r.id, response: text });
      toast.success("Resposta salva");
      setEditing(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar");
    }
  }

  return (
    <div className="rounded-md border border-hairline bg-canvas p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <RatingStars value={r.rating} size="sm" />
          <span className="text-body-sm font-medium text-ink">
            {r.author_name ?? "Cliente Movepark"}
          </span>
          {!r.is_published && (
            <span className="rounded-sm bg-surface-soft px-1.5 py-0.5 text-caption text-muted-steel">
              Despublicada
            </span>
          )}
        </div>
        <span className="text-caption text-muted">
          {r.location_name} · {formatDate(r.created_at)}
        </span>
      </div>
      {r.comment && <p className="mt-2 text-body-sm text-ink">{r.comment}</p>}

      {editing ? (
        <div className="mt-3 flex flex-col gap-2">
          <Textarea
            rows={3}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Responda publicamente a esta avaliação…"
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => setEditing(false)}>
              Cancelar
            </Button>
            <Button size="sm" onClick={save} disabled={respond.isPending}>
              {respond.isPending ? "Salvando…" : "Salvar resposta"}
            </Button>
          </div>
        </div>
      ) : r.owner_response ? (
        <div className="mt-3 rounded-sm bg-surface-soft p-3">
          <p className="text-caption font-bold uppercase tracking-[0.4px] text-muted-steel">
            Sua resposta
          </p>
          <p className="mt-0.5 text-body-sm text-ink">{r.owner_response}</p>
          <Button variant="ghost" size="sm" className="mt-1" onClick={() => setEditing(true)}>
            Editar resposta
          </Button>
        </div>
      ) : (
        <Button variant="outline" size="sm" className="mt-3" onClick={() => setEditing(true)}>
          Responder
        </Button>
      )}
    </div>
  );
}

export default function OperatorReviews() {
  const { effectiveCompanyIds } = useAuth();
  const companyId = effectiveCompanyIds[0];
  const { data, isLoading } = useOperatorReviews(companyId);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Avaliações"
        description="O que os clientes dizem das suas unidades. Responda publicamente para mostrar cuidado."
      />
      {!companyId ? (
        <EmptyState title="Sem empresa vinculada" />
      ) : isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : (data ?? []).length === 0 ? (
        <EmptyState
          icon={<Star className="h-10 w-10" />}
          title="Ainda sem avaliações"
          description="Assim que seus clientes avaliarem, elas aparecem aqui."
        />
      ) : (
        <div className="flex flex-col gap-3">
          {(data ?? []).map((r) => (
            <ReviewRow key={r.id} r={r} companyId={companyId} />
          ))}
        </div>
      )}
    </div>
  );
}
