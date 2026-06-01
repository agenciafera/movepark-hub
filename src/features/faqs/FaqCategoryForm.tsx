import * as React from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useUpsertFaqCategory } from "./api";
import type { FaqCategoryRow } from "./types";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category?: FaqCategoryRow | null;
};

function slugify(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

export function FaqCategoryForm({ open, onOpenChange, category }: Props) {
  const editing = !!category;
  const upsert = useUpsertFaqCategory();

  const [label, setLabel] = React.useState("");
  const [slug, setSlug] = React.useState("");
  const [slugTouched, setSlugTouched] = React.useState(false);
  const [sortOrder, setSortOrder] = React.useState<string>("0");

  React.useEffect(() => {
    if (!open) return;
    setLabel(category?.label ?? "");
    setSlug(category?.slug ?? "");
    setSlugTouched(!!category);
    setSortOrder(String(category?.sort_order ?? 0));
  }, [open, category]);

  React.useEffect(() => {
    if (slugTouched || editing) return;
    setSlug(slugify(label));
  }, [label, slugTouched, editing]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!label.trim() || !slug.trim()) {
      toast.error("Preencha label e slug");
      return;
    }
    try {
      await upsert.mutateAsync({
        id: category?.id,
        label: label.trim(),
        slug: slug.trim(),
        sort_order: parseInt(sortOrder, 10) || 0,
      });
      toast.success("Categoria salva");
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? "Editar categoria" : "Nova categoria"}</DialogTitle>
          <DialogDescription>
            Categorias agrupam as FAQs no site e no backoffice. O slug é usado em URLs.
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="label">Nome</Label>
            <Input
              id="label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Pagamentos"
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="slug">Slug</Label>
            <Input
              id="slug"
              value={slug}
              onChange={(e) => {
                setSlug(slugify(e.target.value));
                setSlugTouched(true);
              }}
              placeholder="pagamentos"
              required
            />
            <span className="text-caption-sm text-muted">
              Aparece na URL: <code>/faq?cat={slug || "pagamentos"}</code>
            </span>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sort">Ordem</Label>
            <Input
              id="sort"
              type="number"
              inputMode="numeric"
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value)}
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={upsert.isPending}>
              {upsert.isPending ? "Salvando…" : "Salvar"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
