import { Link, useLoaderData } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { CaretRight } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/EmptyState";
import { aeroportoEmProsa, shortSemCodigo } from "@/features/faqs/faqPagina.logic";
import {
  DESTINO_DURATIONS,
  pesquisadoRows,
  type PesquisadoInput,
} from "@/features/destinations/destinoPrices.logic";
import {
  mesAnoAtual,
  respostaMaisBarato,
  vagasDoRanking,
  type MaisBaratoLinha,
} from "@/features/price-index/maisBarato.logic";
import { durationLabel } from "@/features/price-index/priceIndex.logic";
import { buildMetaDescription, pickTitle, priceHook } from "@/lib/seo";
import { formatBRL, formatDate } from "@/lib/format";
import { breadcrumbSchema, faqSchema, priceTableOffersSchema } from "@/lib/jsonld";
import { SITE_URL } from "@/lib/site";
import { caminhoDestino, caminhoFicha, caminhoMaisBarato, caminhoPrecos } from "@/lib/urls";

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
  /**
   * Lotes mapeados da região (inclusive o oficial), com o preço pesquisado quando há.
   * Preço pesquisado entra no texto com a data, nunca como oferta (ADR-010).
   */
  lotes?: PesquisadoInput[];
  /** Momento do build em que o motor foi consultado. Vira a validade da oferta. */
  generatedAt?: string;
} | null;

/**
 * Página da intenção "estacionamento mais barato em <aeroporto>": responde a
 * pergunta na primeira frase olhando o mercado da praça, e não só os parceiros.
 * O parceiro sai do motor de reservas (vencedor e segunda opção por duração); o
 * lote mapeado entra com o preço pesquisado e a data (ADR-010). Até a Conteúdo 39
 * a página só via parceiro, e numa praça de parceiro único ele virava "o mais
 * barato" mesmo com o mercado cobrando menos da metade. É uma página por consulta
 * de dinheiro, separada do hub do destino e da tabela completa (/precos).
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

  const { destino, linhas, unitCount, lotes = [], generatedAt } = data;
  const curto = shortSemCodigo(destino.short_name, destino.name);
  const prosa = aeroportoEmProsa(destino);
  const mesAno = mesAnoAtual();
  const canonical = `${SITE_URL}${caminhoMaisBarato(destino.slug)}`;
  const pergunta = `Qual é o estacionamento mais barato no ${prosa}?`;

  // O mercado da praça: lote mapeado com preço pesquisado e fresco. A validade é conferida
  // de novo aqui, na renderização, porque a página é SSG e o HTML envelhece (destinoPrices).
  const pesquisados = pesquisadoRows(lotes, destino.slug, DESTINO_DURATIONS);
  const comPreco = new Set(pesquisados.map((r) => r.key));
  const semPreco = lotes.filter((l) => !comPreco.has(`pesquisado:${l.slug}`));

  // A resposta direta, na primeira frase. É o trecho que a IA extrai e o mesmo
  // texto vai pro FAQPage (schema idêntico ao visível, ADR-002).
  const resposta = respostaMaisBarato({ prosa, linhas, pesquisados, days: DESTINO_DURATIONS });
  const respostaDireta = resposta.direta;
  const respostaSemana = resposta.semana;

  const perguntasRapidas = [
    { q: pergunta, a: respostaDireta },
    ...(respostaSemana
      ? [{ q: `Quanto custa estacionar 7 dias perto do ${prosa}?`, a: respostaSemana }]
      : []),
  ];

  // O preço da tabela em dado estruturado: um `Product` por vaga que aparece no ranking,
  // com o total de cada duração em que ela aparece. Mesmo bloco de /precos, mesma regra:
  // sem preço não há oferta, e sem oferta o item não existe.
  const produtos = generatedAt
    ? priceTableOffersSchema({
        itens: vagasDoRanking(linhas).map(({ opcao, porDuracao }) => ({
          name: opcao.label,
          variant: opcao.parkingTypeName,
          url: opcao.path,
          description: `Estacionamento perto do ${prosa}, com reserva online pela Movepark.`,
          image: opcao.photo,
          porDuracao,
        })),
        generatedAt,
      })
    : null;

  // O mês é sinal de frescor na SERP, mas é a primeira coisa a sair quando o nome do
  // aeroporto é longo: a versão com mês deu 71 caracteres em Guarulhos e o Google cortou
  // justamente a marca.
  const title = pickTitle(
    `Estacionamento mais barato em ${curto} (${destino.code}): ${mesAno} | Movepark`,
    `Estacionamento mais barato em ${curto} (${destino.code}) | Movepark`,
    `Estacionamento mais barato em ${curto} (${destino.code})`,
  );
  // Estrutura única da description do site: palavra-chave, menor preço real e CTA. O número é
  // o mesmo da resposta direta (o menor do mercado), então snippet e página não divergem.
  const description = buildMetaDescription({
    keyword: `Estacionamento mais barato perto do ${prosa}`,
    extra: "vencedor e segunda opção",
    price: priceHook(resposta.menorDoMercado.total, resposta.menorDoMercado.days),
    cta: resposta.menorDoMercado.pesquisado ? "conferir" : "comparar",
  });

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
        <script type="application/ld+json">
          {JSON.stringify(faqSchema(perguntasRapidas.map((p) => ({ question: p.q, answer: p.a }))))}
        </script>
        {produtos && <script type="application/ld+json">{JSON.stringify(produtos)}</script>}
        <script type="application/ld+json">
          {JSON.stringify(
            breadcrumbSchema([
              { name: "Início", url: SITE_URL },
              { name: curto, url: `${SITE_URL}${caminhoDestino(destino.slug)}` },
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
              <Link to={caminhoDestino(destino.slug)} className="hover:text-ink">
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
            Preços de {mesAno}. {unitCount} com reserva pela Movepark, direto do motor de reservas
            {pesquisados.length > 0
              ? `, e ${pesquisados.length} sem reserva online, com preço pesquisado`
              : ""}
            .
          </p>
        </header>

        {/* Resposta direta: o vencedor por duração antes de qualquer tabela. */}
        <section className="mt-6 rounded-lg bg-mp-pale p-5 tablet:p-6">
          <p className="whitespace-pre-wrap text-body-md leading-[1.65] text-body">
            {respostaDireta}
          </p>
        </section>

        <section className="mt-8">
          <h2 className="text-display-sm text-ink">Menor preço com reserva pela Movepark</h2>
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
              to={caminhoPrecos(destino.slug)}
              className="font-medium text-mp-indigo underline-offset-2 hover:underline"
            >
              Ver a tabela completa, com todos os parceiros e o preço de balcão
            </Link>
          </p>
        </section>

        {/* O resto do mercado: lote mapeado com o preço pesquisado e a data de cada linha.
            Sem botão de reserva e fora do JSON-LD de oferta (ADR-009 e ADR-010). */}
        {pesquisados.length > 0 && (
          <section className="mt-8">
            <h2 className="text-display-sm text-ink">Sem reserva online pela Movepark</h2>
            <p className="mt-2 text-pretty text-body-md text-body">
              Preços que a Movepark conferiu em cada estacionamento, com a data da pesquisa. A
              reserva é com o próprio estacionamento, e o valor pode ter mudado desde então.
            </p>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-body-sm">
                <thead>
                  <tr className="border-b border-hairline text-muted">
                    <th className="py-2 pr-4 font-medium">Estacionamento</th>
                    {DESTINO_DURATIONS.map((d) => (
                      <th key={d} className="py-2 pr-4 font-medium">
                        {durationLabel(d)}
                      </th>
                    ))}
                    <th className="py-2 font-medium">Pesquisado em</th>
                  </tr>
                </thead>
                <tbody>
                  {pesquisados.map((r) => (
                    <tr key={r.key} className="border-b border-hairline-soft">
                      <td className="py-2 pr-4 text-ink">
                        {r.path ? (
                          <Link
                            to={r.path}
                            className="font-medium text-mp-indigo underline-offset-2 hover:underline"
                          >
                            {r.shortLabel}
                          </Link>
                        ) : (
                          r.shortLabel
                        )}
                      </td>
                      {r.totals.map((t, i) => (
                        <td key={DESTINO_DURATIONS[i]} className="py-2 pr-4 text-body">
                          {t == null ? (
                            <span className="text-muted">não pesquisado</span>
                          ) : (
                            formatBRL(t)
                          )}
                        </td>
                      ))}
                      <td className="py-2 text-muted">
                        <time dateTime={r.researchedAt}>{formatDate(r.researchedAt)}</time>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

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

        {/* A praça completa: os lotes mapeados ainda sem preço pesquisado (inclusive o
            oficial do aeroporto, quando está cadastrado) entram por link. É a resposta
            que a IA procura quando pergunta "e o estacionamento oficial?". */}
        {semPreco.length > 0 && (
          <section className="mt-8">
            <h2 className="text-display-sm text-ink">E os outros estacionamentos da região?</h2>
            <p className="mt-2 text-body-md text-body">
              Estes lotes perto do {aeroportoEmProsa(destino)} ainda não têm preço pesquisado pela
              Movepark, incluindo o oficial do aeroporto quando existe. A ficha de cada um traz
              endereço, mapa e a nota do Google; o preço você confirma com o próprio estacionamento.
            </p>
            <ul className="mt-3 space-y-2">
              {semPreco.map((m) => (
                <li key={m.slug}>
                  <Link
                    to={m.public_path ?? caminhoFicha(destino.slug, m.public_slug ?? m.slug)}
                    className="font-medium text-mp-indigo underline-offset-2 hover:underline"
                  >
                    {m.public_name ?? m.name}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

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
            <Link to={caminhoDestino(destino.slug)}>Reservar vaga em {curto}</Link>
          </Button>
          <Button asChild variant="outline">
            <Link to={caminhoPrecos(destino.slug)}>Comparar preços em {curto}</Link>
          </Button>
        </div>
      </article>
    </>
  );
}
