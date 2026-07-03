import * as React from "react";
import { toast } from "sonner";
import { ArrowLeft, MoreVertical, Plus } from "@/lib/icons";
import { Link } from "react-router-dom";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FaqCategoryForm } from "@/features/faqs/FaqCategoryForm";
import {
  useDeleteFaqCategory,
  useFaqCategories,
} from "@/features/faqs/api";
import type { FaqCategoryRow } from "@/features/faqs/types";

export default function ManagerFaqCategorias() {
  const cats = useFaqCategories();
  const remove = useDeleteFaqCategory();
  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<FaqCategoryRow | null>(null);

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }
  function openEdit(c: FaqCategoryRow) {
    setEditing(c);
    setFormOpen(true);
  }

  async function handleDelete(c: FaqCategoryRow) {
    if (!confirm(`Remover a categoria "${c.label}"? FAQs já associadas ficam sem categoria.`))
      return;
    try {
      await remove.mutateAsync(c.id);
      toast.success("Categoria removida");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro");
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Categorias de FAQ"
        description="Agrupam as perguntas no /faq e nos formulários do backoffice."
        actions={
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" asChild>
              <Link to="/manager/faq">
                <ArrowLeft className="h-4 w-4" />
                Voltar
              </Link>
            </Button>
            <Button onClick={openCreate} size="sm">
              <Plus className="h-4 w-4" />
              Nova categoria
            </Button>
          </div>
        }
      />

      {cats.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-md" />
          ))}
        </div>
      ) : (cats.data ?? []).length === 0 ? (
        <EmptyState title="Sem categorias" description="Crie a primeira." />
      ) : (
        <ul className="divide-y divide-hairline rounded-md border border-hairline bg-canvas">
          {(cats.data ?? []).map((c) => (
            <li key={c.id} className="flex items-center gap-4 px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="text-body-md text-ink">{c.label}</div>
                <div className="text-body-sm text-muted">
                  <code>{c.slug}</code> · ordem {c.sort_order}
                </div>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" aria-label="Mais ações">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => openEdit(c)}>Editar</DropdownMenuItem>
                  <DropdownMenuItem
                    className="!text-error"
                    onClick={() => handleDelete(c)}
                  >
                    Remover
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </li>
          ))}
        </ul>
      )}

      <FaqCategoryForm
        open={formOpen}
        onOpenChange={setFormOpen}
        category={editing}
      />
    </div>
  );
}
