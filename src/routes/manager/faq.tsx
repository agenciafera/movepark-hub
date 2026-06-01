import * as React from "react";
import { Link } from "react-router-dom";
import { Plus, Search, Settings2 } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FaqAdminTable } from "@/features/faqs/FaqAdminTable";
import { FaqForm } from "@/features/faqs/FaqForm";
import { useFaqCategories, useFaqs } from "@/features/faqs/api";
import type { Faq } from "@/features/faqs/types";

export default function ManagerFaq() {
  const cats = useFaqCategories();
  const [query, setQuery] = React.useState("");
  const [categorySlug, setCategorySlug] = React.useState<string>("all");
  const list = useFaqs({
    scope: "global",
    includeUnpublished: true,
    query,
    categorySlug: categorySlug === "all" ? undefined : categorySlug,
  });

  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Faq | null>(null);

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }
  function openEdit(faq: Faq) {
    setEditing(faq);
    setFormOpen(true);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="FAQ"
        description="Perguntas e respostas globais da Movepark. Aparecem no /faq e nas páginas de estacionamento."
        actions={
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" asChild>
              <Link to="/manager/faq/categorias">
                <Settings2 className="h-4 w-4" />
                Categorias
              </Link>
            </Button>
            <Button onClick={openCreate} size="sm">
              <Plus className="h-4 w-4" />
              Nova pergunta
            </Button>
          </div>
        }
      />

      <div className="flex flex-col gap-3 tablet:flex-row tablet:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <Input
            placeholder="Buscar pergunta…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={categorySlug} onValueChange={setCategorySlug}>
          <SelectTrigger className="tablet:w-[220px]">
            <SelectValue placeholder="Todas as categorias" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as categorias</SelectItem>
            {(cats.data ?? []).map((c) => (
              <SelectItem key={c.id} value={c.slug}>
                {c.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <FaqAdminTable
        rows={list.data}
        isLoading={list.isLoading}
        onEdit={openEdit}
      />

      <FaqForm
        open={formOpen}
        onOpenChange={setFormOpen}
        faq={editing}
        scope="global"
      />
    </div>
  );
}
