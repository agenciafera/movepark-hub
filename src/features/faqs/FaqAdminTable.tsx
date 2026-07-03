import { toast } from "sonner";
import { Edit2, MoreVertical, Trash2 } from "@/lib/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/shared/EmptyState";
import { useDeleteFaq, useUpdateFaq } from "./api";
import type { Faq } from "./types";

type Props = {
  rows: Faq[] | undefined;
  isLoading?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  showScope?: boolean;
  showLocation?: boolean;
  /** Mapa locationId → nome, pra render. */
  locationNames?: Record<string, string>;
  readOnly?: boolean;
  onEdit?: (faq: Faq) => void;
};

export function FaqAdminTable({
  rows,
  isLoading,
  emptyTitle = "Nenhuma pergunta cadastrada",
  emptyDescription = "Crie a primeira clicando em \"Nova pergunta\".",
  showScope = false,
  showLocation = false,
  locationNames = {},
  readOnly = false,
  onEdit,
}: Props) {
  const update = useUpdateFaq();
  const remove = useDeleteFaq();

  async function togglePublish(faq: Faq, next: boolean) {
    try {
      await update.mutateAsync({ id: faq.id, patch: { is_published: next } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao atualizar");
    }
  }

  async function handleDelete(faq: Faq) {
    if (!confirm(`Remover "${faq.question}"?`)) return;
    try {
      await remove.mutateAsync(faq.id);
      toast.success("FAQ removido");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao remover");
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-md" />
        ))}
      </div>
    );
  }

  if (!rows || rows.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} />;
  }

  return (
    <ul className="divide-y divide-hairline rounded-md border border-hairline bg-canvas">
      {rows.map((faq) => (
        <li key={faq.id} className="flex items-center gap-4 px-4 py-3">
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-body-md text-ink line-clamp-1">{faq.question}</span>
              {faq.category && (
                <Badge tone="neutral" className="shrink-0">
                  {faq.category.label}
                </Badge>
              )}
              {showScope && (
                <Badge tone={faq.scope === "global" ? "neutral" : "active"} className="shrink-0">
                  {faq.scope === "global"
                    ? "Geral"
                    : faq.scope === "destination"
                      ? "Destino"
                      : "Da unidade"}
                </Badge>
              )}
              {showLocation && faq.location_id && (
                <Badge tone="neutral" className="shrink-0">
                  {locationNames[faq.location_id] ?? "—"}
                </Badge>
              )}
            </div>
            <p className="line-clamp-2 text-body-sm text-muted">{faq.answer}</p>
          </div>

          <div className="flex shrink-0 items-center gap-3">
            <Switch
              checked={faq.is_published}
              onCheckedChange={(v) => togglePublish(faq, v === true)}
              disabled={readOnly}
              aria-label="Publicado"
            />
            {!readOnly && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" aria-label="Mais ações">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {onEdit && (
                    <DropdownMenuItem onClick={() => onEdit(faq)}>
                      <Edit2 className="h-4 w-4" />
                      Editar
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem
                    className="!text-error"
                    onClick={() => handleDelete(faq)}
                  >
                    <Trash2 className="h-4 w-4" />
                    Remover
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
