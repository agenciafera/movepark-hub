import { Link, useLoaderData } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { CaretRight } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/EmptyState";
import { aeroportoEmProsa, shortSemCodigo } from "@/features/faqs/faqPagina.logic";
import { mesAnoAtual, type MaisBaratoLinha } from "@/features/price-index/maisBarato.logic";
import { durationLabel } from "@/features/price-index/priceIndex.logic";
import { formatBRL } from "@/lib/format";
import { breadcrumbSchema, faqSchema } from "@/lib/jsonld";
import { SITE_URL } from "@/lib/site";

/** O que o loader entrega: o destino e o ranking de menor preço por duração. */
export type MaisBaratoData = {
  destino: {
    name: string;
    short_name: string | null;
    slug: string;
    code: string;
  };
  linhas: MaisBaratoLinha[];
  unitCount: number;
} | null;

/**
 * Página da intenção "estacionamento mais barato em <aeroporto>": responde a
 * pergunta na primeira frase, com vencedor e segunda opção por duração, direto
 * do motor de reservas. É uma página por consulta de dinheiro, separada do hub
 * do destino (/destinos) e da tabela completa (/precos), cada uma com o seu
 * title, sem disputar a mesma posição.
 */
export default function EstacionamentoMaisBaratoPage() {
  const data = useLoaderData() as MaisBaratoData;

  if (!data || data.linhas.length === 0) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-16">
        <EmptyState
          title="Ainda não temos preços neste destino"
          description="Os aeroportos com comparativo de preço estão no índice."
          action={
            <Link to="/precos" className="text-mp-primary underline">
              Ver o índice de preços
            </Link>
          }
        />
      </div>
    );
  }

  const { destino, linhas, unitCount } = data;
  const curto = shortSemCodigo(destino.short_name, destino.name);
  const prosa = aeroportoEmProsa(destino);
  const mesAno = mesAnoAtual();
  const canonical = `${SITE_URL}/estacionamento-mais-barato/${destino.slug}`;
  const pergunta = `Qual é o estacionamento mais barato no ${prosa}?`;

  const diaria = linhas.find((l) => l.days === 1) ?? linhas[0];
  const semana = linhas.find((l) => l.days === 7) ?? null;
  const mes = linhas.find((l) => l.days === 30) ?? null;

  // A resposta direta, na primeira frase. É o trecho que a IA extrai e o mesmo
  // texto vai pro FAQPage (schema idêntico ao visível, ADR-002).
  const respostaDireta = [
    diaria.days === 1
      ? `Hoje, a diária avulsa mais barata perto do ${prosa} custa ${formatBRL(diaria.vencedor.total)}, no ${diaria.vencedor.label} (${diaria.vencedor.parkingTypeName}).`
      : `Hoje, o menor total para ${durationLabel(diaria.days).toLowerCase()} perto do ${prosa} é ${formatBRL(diaria.vencedor.total)}, no ${diaria.vencedor.label} (${diaria.vencedor.parkingTypeName}).`,
    semana
      ? `Para 7 dias, o menor total é ${formatBRL(semana.vencedor.total)} (${formatBRL(semana.vencedor.perDay)} por dia), no ${semana.vencedor.label}.`
      : null,
    mes
      ? `Para 30 dias, ${formatBRL(mes.vencedor.total)} (${formatBRL(mes.vencedor.perDay)} por dia), no ${mes.vencedor.label}.`
      : null,
    "Os valores saem do motor de reservas, os mesmos do checkout, e mudam quando a tabela do parceiro muda.",
  ]
    .filter(Boolean)
    .join(" ");

  const respostaSemana = semana
    ? `Estacionar 7 dias perto do ${prosa} custa a partir de ${formatBRL(semana.vencedor.total)} (${formatBRL(semana.vencedor.perDay)} por dia), no ${semana.vencedor.label}. A tabela completa por parceiro está na página de preços.`
    : null;

  const perguntasRapidas = [
    { q: pergunta, a: respostaDireta },
    ...(respostaSemana
      ? [{ q: `Quanto custa estacionar 7 dias perto do ${prosa}?`, a: respostaSemana }]
      : []),
  ];

  const title = `Estacionamento mais barato em ${curto} (${destino.code}): ${mesAno} | Movepark`;
  const description = `${durationLabel(diaria.days)} a partir de ${formatBRL(diaria.vencedor.total)} perto do ${prosa}. Vencedor e segunda opção por duração, com o preço do motor de reservas.`;

  return (
    <>
      <Helmet>
        <title>{title}</title>
        <meta name="description" content={description} />
        <link rel="canonical" href={canonical} />
        <meta property="og:type" content="article" />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
        <meta property="og:url" content={canonical} />
        <script type="application/ld+json">{JSON.stringify(faqSchema(perguntasRapidas.map((p) => ({ question: p.q, answer: p.a }))))}</script>
        <script type="application/ld+json">
          {JSON.stringify(
            breadcrumbSchema([
              { name: "Início", url: SITE_URL },
              { name: curto, url: `${SITE_URL}/destinos/${destino.slug}` },
              { name: "Mais barato", url: canonical },
            ]),
          )}
        </script>
      </Helmet>

      <article className="mx-auto w-full max-w-3xl px-4 py-8 tablet:py-12">
        <nav aria-label="Trilha de navegação" className="mb-4">
          <ol className="flex flex-wrap items-center gap-1.5 text-body-sm text-muted">
            <li>
              <Link to="/" className="hover:text-ink">
                Início
              </Link>
            </li>
            <li aria-hidden className="text-muted-steel">
              ›
            </li>
            <li>
              <Link to={`/destinos/${destino.slug}`} className="hover:text-ink">
                {curto}
              </Link>
            </li>
            <li aria-hidden className="text-muted-steel">
              ›
            </li>
            <li aria-current="page" className="text-ink">
              Mais barato
            </li>
          </ol>
        </nav>

        <header>
          <h1 className="text-balance text-display-xl text-ink">{pergunta}</h1>
          <p className="mt-3 text-caption-sm text-muted">
            Preços de {mesAno}, direto do motor de reservas. {unitCount}{" "}
            {unitCount === 1 ? "estacionamento comparado" : "estacionamentos comparados"}.
          </p>
        </header>

        {/* Resposta direta: o vencedor por duração antes de qualquer tabela. */}
        <section className="mt-6 rounded-lg bg-mp-pale p-5 tablet:p-6">
          <p className="whitespace-pre-wrap text-body-md leading-[1.65] text-body">
            {respostaDireta}
          </p>
        </section>

        <section className="mt-8">
          <h2 className="text-display-sm text-ink">Menor preço por duração</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[520px] text-left text-body-sm">
              <thead>
                <tr className="border-b border-hairline text-muted">
                  <th className="py-2 pr-4 font-medium">Período</th>
                  <th className="py-2 pr-4 font-medium">Mais barato</th>
                  <th className="py-2 pr-4 font-medium">Total</th>
                  <th className="py-2 font-medium">Segunda opção</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((l) => (
                  <tr key={l.days} className="border-b border-hairline-soft">
                    <td className="py-2 pr-4 text-ink">{durationLabel(l.days)}</td>
                    <td className="py-2 pr-4 text-ink">
                      <Link
                        to={l.vencedor.path}
                        className="font-medium text-mp-indigo underline-offset-2 hover:underline"
                      >
                        {l.vencedor.label}
                      </Link>{" "}
                      <span className="text-muted">({l.vencedor.parkingTypeName})</span>
                    </td>
                    <td className="py-2 pr-4 text-ink">
                      {formatBRL(l.vencedor.total)}{" "}
                      <span className="text-muted">({formatBRL(l.vencedor.perDay)}/dia)</span>
                    </td>
                    <td className="py-2 text-body">
                      {l.vice ? `${l.vice.label}, ${formatBRL(l.vice.total)}` : "sem segunda opção"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-body-sm text-muted">
            <Link
              to={`/precos/${destino.slug}`}
              className="font-medium text-mp-indigo underline-offset-2 hover:underline"
            >
              Ver a tabela completa, com todos os parceiros e o preço de balcão
            </Link>
          </p>
        </section>

        <section className="mt-8">
          <h2 className="text-display-sm text-ink">Mais barato nem sempre é o melhor</h2>
          <ul className="mt-3 space-y-2">
            {[
              "Confira se o traslado até o terminal está incluído e a frequência dele.",
              "Vaga descoberta custa menos; a coberta protege de sol e chuva.",
              "Olhe a distância real até o terminal e a avaliação de quem já usou.",
              "Veja o prazo de cancelamento grátis antes de fechar.",
            ].map((item) => (
              <li key={item} className="flex items-start gap-2 text-body-md text-body">
                <CaretRight className="mt-1 h-4 w-4 shrink-0 text-mp-primary" aria-hidden />
                {item}
              </li>
            ))}
          </ul>
        </section>

        {/* Perguntas rápidas: o mesmo texto do FAQPage, visível (ADR-002). */}
        <section className="mt-8">
          <h2 className="text-display-sm text-ink">Perguntas rápidas</h2>
          <div className="mt-3 space-y-4">
            {perguntasRapidas.map((p) => (
              <div key={p.q}>
                <h3 className="text-title-md text-ink">{p.q}</h3>
                <p className="mt-1 whitespace-pre-wrap text-body-md leading-[1.65] text-body">
                  {p.a}
                </p>
              </div>
            ))}
          </div>
        </section>

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Button asChild>
            <Link to={`/destinos/${destino.slug}`}>Reservar vaga em {curto}</Link>
          </Button>
          <Button asChild variant="outline">
            <Link to={`/precos/${destino.slug}`}>Comparar preços em {curto}</Link>
          </Button>
        </div>
      </article>
    </>
  );
}
