import * as React from "react";
import { useSearchParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { MagnifyingGlass } from "@phosphor-icons/react";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/EmptyState";
import { ContentPageView } from "@/features/content/ContentPageView";
import { RELACIONADOS } from "@/features/content/pages";
import { readingMinutes, type Section } from "@/features/content/types";
import { faqJsonLd } from "@/features/content/jsonld";
import { useFaqs } from "@/features/faqs/api";

/**
 * FAQ com uma seção por categoria.
 *
 * Antes a categoria FILTRAVA a lista, então o leitor via um recorte por vez e as
 * outras respostas não existiam na página nem para o buscador. Agora todas ficam
 * na mesma página e a categoria virou âncora do índice.
 *
 * O `?cat=` continua valendo: a Central de Ajuda linka `/faq?cat=pagamentos` e o
 * Manager documenta essa URL. Ele agora rola até a seção em vez de filtrar.
 */
export default function FaqPage() {
  const [params, setParams] = useSearchParams();
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

  const list = useFaqs({ scope: "global", query: query || undefined });

  /** Uma seção por categoria, na ordem do banco, sem categoria vazia. */
  const sections: Section[] = React.useMemo(() => {
    const porCategoria = new Map<string, { label: string; ordem: number; itens: { q: string; a: string }[] }>();

    for (const f of list.data ?? []) {
      const slug = f.category?.slug ?? "outras";
      const atual = porCategoria.get(slug) ?? {
        label: f.category?.label ?? "Outras dúvidas",
        ordem: f.category?.sort_order ?? 999,
        itens: [],
      };
      atual.itens.push({ q: f.question, a: f.answer });
      porCategoria.set(slug, atual);
    }

    return [...porCategoria.entries()]
      .sort((a, b) => a[1].ordem - b[1].ordem)
      .map(([slug, c]) => ({
        id: slug,
        title: c.label,
        blocks: [{ type: "faq" as const, items: c.itens }],
      }));
  }, [list.data]);

  // `?cat=` vira âncora: o link antigo continua levando ao mesmo lugar.
  const cat = params.get("cat");
  const prontas = sections.length > 0;
  React.useEffect(() => {
    if (!cat || !prontas) return;
    document.getElementById(cat)?.scrollIntoView({ block: "start" });
  }, [cat, prontas]);

  const schema = faqJsonLd(sections);

  return (
    <>
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
        {schema && <script type="application/ld+json">{JSON.stringify(schema)}</script>}
      </Helmet>

      <ContentPageView
        label="Perguntas frequentes"
        title="Perguntas frequentes"
        intro="Reservas, pagamentos e check-in, com as respostas que o suporte mais repete."
        readMinutes={readingMinutes(sections)}
        sections={sections}
        related={[RELACIONADOS["como-funciona"], RELACIONADOS.cancelamento]}
        bodyTop={
          <>
            <div className="relative mb-6 max-w-xl print:hidden">
              <MagnifyingGlass
                className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
                aria-hidden
              />
              <Input
                placeholder="Buscar pergunta…"
                aria-label="Buscar pergunta"
                value={queryDraft}
                onChange={(e) => setQueryDraft(e.target.value)}
                className="pl-9"
              />
            </div>

            {list.isLoading && (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full rounded-md" />
                ))}
              </div>
            )}

            {!list.isLoading && sections.length === 0 && (
              <EmptyState
                title="Nenhuma pergunta encontrada"
                description={
                  query
                    ? `Nada bateu com "${query}". Tente outra palavra ou fale com o suporte.`
                    : "As perguntas ainda não foram publicadas."
                }
              />
            )}
          </>
        }
      />
    </>
  );
}
