import * as React from "react";
import { toast } from "sonner";
import { Star } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate } from "@/lib/format";
import { RatingStars } from "@/features/reviews/RatingStars";
import {
  useAllReviews,
  useSetReviewPublished,
  type ManagerReview,
} from "@/features/reviews/managerApi";

export default function ManagerReviews() {
  const [onlyUnpublished, setOnlyUnpublished] = React.useState(false);
  const { data, isLoading } = useAllReviews(onlyUnpublished);
  const setPublished = useSetReviewPublished();

  async function toggle(r: ManagerReview) {
    try {
      await setPublished.mutateAsync({ id: r.id, is_published: !r.is_published });
      toast.success(r.is_published ? "Avaliação despublicada" : "Avaliação publicada");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao moderar");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Avaliações"
        description="Modere as avaliações dos estacionamentos. Despublicar remove da página da unidade e recalcula a nota."
        actions={
          <Button
            variant={onlyUnpublished ? "primary" : "secondary"}
            size="sm"
            onClick={() => setOnlyUnpublished((v) => !v)}
          >
            {onlyUnpublished ? "Mostrando despublicadas" : "Só despublicadas"}
          </Button>
        }
      />

      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : (data ?? []).length === 0 ? (
        <EmptyState
          icon={<Star className="h-10 w-10" />}
          title={onlyUnpublished ? "Nenhuma avaliação despublicada" : "Ainda sem avaliações"}
        />
      ) : (
        <div className="overflow-x-auto rounded-md border border-hairline">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nota</TableHead>
                <TableHead>Autor</TableHead>
                <TableHead>Unidade / Empresa</TableHead>
                <TableHead>Comentário</TableHead>
                <TableHead>Data</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data ?? []).map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <RatingStars value={r.rating} size="sm" />
                  </TableCell>
                  <TableCell className="text-body-sm text-ink">
                    {r.author_name ?? "Cliente"}
                  </TableCell>
                  <TableCell className="text-body-sm">
                    <div className="text-ink">{r.location_name ?? "-"}</div>
                    <div className="text-caption text-muted">{r.company_name ?? ""}</div>
                  </TableCell>
                  <TableCell className="max-w-[320px] text-body-sm text-muted">
                    <span className="line-clamp-2">{r.comment ?? "-"}</span>
                  </TableCell>
                  <TableCell className="text-caption text-muted">
                    {formatDate(r.created_at)}
                  </TableCell>
                  <TableCell>
                    <Badge tone={r.is_published ? "confirmed" : "pending"}>
                      {r.is_published ? "Publicada" : "Despublicada"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Button
                      size="sm"
                      variant={r.is_published ? "ghost" : "secondary"}
                      onClick={() => toggle(r)}
                      disabled={setPublished.isPending}
                    >
                      {r.is_published ? "Despublicar" : "Publicar"}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
