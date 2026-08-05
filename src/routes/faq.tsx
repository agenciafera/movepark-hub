import * as React from "react";
import { useSearchParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { MagnifyingGlass } from "@phosphor-icons/react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageHeader } from "@/components/shared/PageHeader";
import { cn } from "@/lib/utils";
import { useFaqCategories, useFaqs } from "@/features/faqs/api";
import { FaqList } from "@/features/faqs/FaqList";
import type { FaqCombinedItem } from "@/features/faqs/api";
import { faqSchema } from "@/lib/jsonld";

export default function FaqPage() {
  const [params, setParams] = useSearchParams();
  const cats = useFaqCategories();
  const categorySlug = params.get("cat") ?? undefined;
  const query = params.get("q") ?? "";
  const [queryDraft, setQueryDraft] = React.useState(query);

  React.useEffect(() => {
    setQueryDraft(query);
  }, [query]);

  // Debounce simples — só altera URL após 300ms
  React.useEffect(() => {
    const t = window.setTimeout(() => {
      const next = new URLSearchParams(params);
      if (queryDraft) next.set("q", queryDraft);
      else next.delete("q");
      if (next.toString() !== params.toString()) {
        setParams(next, { replace: true });
      }
    }, 300);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryDraft]);

  const list = useFaqs({
    scope: "global",
    categorySlug,
    query: query || undefined,
  });


  // Adapta o shape pro FaqList (que espera FaqCombinedItem)
  const items: FaqCombinedItem[] = React.useMemo(
    () =>
      (list.data ?? []).map((f) => ({
        id: f.id,
        scope: f.scope,
        location_id: f.location_id,
        destination_id: f.destination_id,
        question: f.question,
        answer: f.answer,
        sort_order: f.sort_order,
        category: f.category
          ? {
              slug: f.category.slug,
              label: f.category.label,
              sort_order: f.category.sort_order,
            }
          : null,
      })),
    [list.data],
  );

  function setCategory(slug: string | null) {
    const next = new URLSearchParams(params);
    if (slug) next.set("cat", slug);
    else next.delete("cat");
    setParams(next, { replace: true });
  }

  // Uma fonte só para as duas superfícies (sidebar no desktop, select no mobile):
  // "Todas" na frente e as categorias do banco. `slug: null` é a opção "Todas".
  const categoryOptions = React.useMemo(
    () => [
      { key: "all", slug: null as string | null, label: "Todas" },
      ...(cats.data ?? []).map((c) => ({ key: c.id, slug: c.slug, label: c.label })),
    ],
    [cats.data],
  );
  const activeSlug = categorySlug ?? null;

  const faqJsonLd = list.data?.length
    ? JSON.stringify(
        faqSchema((list.data ?? []).map((f) => ({ question: f.question, answer: f.answer }))),
      )
    : null;

  return (
    <div className="mx-auto w-full max-w-[1080px] px-4 py-12 desktop:px-8">
      <Helmet>
        <title>Perguntas Frequentes | Movepark</title>
        <meta
          name="description"
          content="Tire suas dúvidas sobre reservas, pagamentos, check-in e mais. FAQ completo do Movepark."
        />
        <meta property="og:title" content="Perguntas Frequentes | Movepark" />
        <meta
          property="og:description"
          content="Tire suas dúvidas sobre reservas, pagamentos, check-in e mais."
        />
        <meta property="og:url" content="https://hub.movepark.co/faq" />
        <link rel="canonical" href="https://hub.movepark.co/faq" />
        {faqJsonLd && (
          <script type="application/ld+json">{faqJsonLd}</script>
        )}
      </Helmet>
      <PageHeader
        variant="content"
        className="mb-8"
        title="Perguntas frequentes"
        description="Reservas, pagamentos, check-in… tudo o que você precisa saber em um lugar só."
      >
        <div className="relative mt-2 max-w-xl">
          <MagnifyingGlass className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <Input
            placeholder="Buscar pergunta…"
            value={queryDraft}
            onChange={(e) => setQueryDraft(e.target.value)}
            className="pl-9"
          />
        </div>
      </PageHeader>

      {/* Mobile: categoria vira um select. A lista de botões empilhada empurrava as
          perguntas pra baixo e, quando ficava lado a lado, estourava a largura. */}
      <div className="mb-6 tablet:hidden">
        <Select
          value={activeSlug ?? "all"}
          onValueChange={(v) => setCategory(v === "all" ? null : v)}
        >
          <SelectTrigger aria-label="Categoria">
            <SelectValue placeholder="Categoria" />
          </SelectTrigger>
          <SelectContent>
            {categoryOptions.map((o) => (
              <SelectItem key={o.key} value={o.slug ?? "all"}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 gap-8 tablet:grid-cols-[200px_1fr]">
        {/* Desktop: mesma seleção como sidebar de botões. */}
        <aside className="hidden space-y-1 tablet:block">
          {categoryOptions.map((o) => (
            <button
              key={o.key}
              type="button"
              onClick={() => setCategory(o.slug)}
              className={cn(
                "w-full rounded-sm px-3 py-2 text-left text-body-sm transition-colors",
                activeSlug === o.slug
                  ? "bg-mp-pale text-mp-indigo"
                  : "text-muted hover:bg-surface-soft hover:text-ink",
              )}
            >
              {o.label}
            </button>
          ))}
        </aside>

        <FaqList items={items} isLoading={list.isLoading} query={query || undefined} />
      </div>
    </div>
  );
}
