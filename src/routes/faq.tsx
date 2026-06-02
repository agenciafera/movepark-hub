import * as React from "react";
import { useSearchParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
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

  const faqJsonLd = list.data?.length
    ? JSON.stringify(
        faqSchema((list.data ?? []).map((f) => ({ question: f.question, answer: f.answer }))),
      )
    : null;

  return (
    <div className="mx-auto w-full max-w-[1080px] px-4 py-10 desktop:px-8">
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
        <meta property="og:url" content="https://movepark.com.br/faq" />
        <link rel="canonical" href="https://movepark.com.br/faq" />
        {faqJsonLd && (
          <script type="application/ld+json">{faqJsonLd}</script>
        )}
      </Helmet>
      <header className="mb-8 space-y-3">
        <h1 className="text-display-lg text-ink">Perguntas frequentes</h1>
        <p className="text-body-lg text-muted">
          Reservas, pagamentos, check-in… tudo o que você precisa saber em um lugar só.
        </p>
        <div className="relative max-w-xl">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <Input
            placeholder="Buscar pergunta…"
            value={queryDraft}
            onChange={(e) => setQueryDraft(e.target.value)}
            className="pl-9"
          />
        </div>
      </header>

      <div className="grid grid-cols-1 gap-8 tablet:grid-cols-[200px_1fr]">
        <aside className="space-y-1">
          <button
            type="button"
            onClick={() => setCategory(null)}
            className={cn(
              "w-full rounded-sm px-3 py-2 text-left text-body-sm transition-colors",
              !categorySlug
                ? "bg-mp-pale text-mp-indigo"
                : "text-muted hover:bg-surface-soft hover:text-ink",
            )}
          >
            Todas
          </button>
          {(cats.data ?? []).map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setCategory(c.slug)}
              className={cn(
                "w-full rounded-sm px-3 py-2 text-left text-body-sm transition-colors",
                categorySlug === c.slug
                  ? "bg-mp-pale text-mp-indigo"
                  : "text-muted hover:bg-surface-soft hover:text-ink",
              )}
            >
              {c.label}
            </button>
          ))}
        </aside>

        <FaqList items={items} isLoading={list.isLoading} query={query || undefined} />
      </div>
    </div>
  );
}
