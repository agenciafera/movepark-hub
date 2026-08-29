import * as React from "react";
import { Link, useLoaderData } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { ArrowRight, Info, MagnifyingGlass } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Breadcrumb } from "@/components/shared/Breadcrumb";
import { EmptyState } from "@/components/shared/EmptyState";
import { PageHero } from "@/components/shared/PageHero";
import { formatBRL, formatDate } from "@/lib/format";
import { datasetSchema, breadcrumbSchema, itemListSchema } from "@/lib/jsonld";
import { cn } from "@/lib/utils";
import { OgImage } from "@/lib/ogImage";
import {
  INDEX_DEFAULT_PERIOD,
  INDEX_PERIODS,
  airportStates,
  buildAirportSections,
  destinationSummary,
  formatDistance,
  groupAirports,
  listingPath,
  matchesAirportFilter,
  minPerDay,
  overallStats,
  periodLabel,
  sortRowsByPeriod,
  type AirportFilter,
  type AirportMeta,
  type AirportSection,
  type IndexProspect,
  type MatrixRow,
  type PriceIndexData,
} from "@/features/price-index/priceIndex.logic";
import { SITE_URL } from "@/lib/site";
import { caminhoDestino, caminhoPrecos } from "@/lib/urls";

/** Mesmo recuo do container do `PageHero`, para o cartão nascer alinhado com o h1. */
const CONTAINER = "mx-auto w-full max-w-[1080px] px-4 desktop:px-8";
const CARTAO = "rounded-lg border border-hairline bg-canvas";

export type PrecosIndexData = {
  data: PriceIndexData;
  /** Todos os aeroportos publicados, com ou sem parceiro precificado. */
  aeroportos: AirportMeta[];
  /** Lotes mapeados sem contrato por slug de destino (ADR-010). */
  prospects: Record<string, IndexProspect[]>;
  /** Momento do build (ou da navegação) em que o motor foi consultado. */
  generatedAt: string;
};

const DESCRIPTION =
  "Preços de estacionamento em todos os aeroportos: diária avulsa, 7 e 15 dias, preço de " +
  "balcão e reserva online. O valor da tabela é o mesmo do checkout.";

/**
 * De onde vêm os preços, em pergunta e resposta. Fica em accordion, mas com
 * `forceMount`: a resposta continua no HTML com o item fechado, porque crawler
 * de IA não abre accordion.
 *
 * O texto é o mesmo que a página já trazia em três parágrafos corridos, só
 * recortado por pergunta. Copy de metodologia é o que sustenta a citação da
 * página, então ela é reorganizada, nunca reescrita por cima.
 */
const METODOLOGIA: { q: string; a: React.ReactNode }[] = [
  {
    q: "De onde vem cada preço?",
    a: (
      <>
        Do motor de preços da Movepark, o mesmo que calcula sua reserva. O valor que aparece aqui é
        o cobrado no checkout e muda junto com a tabela de cada parceiro, com a data da última
        atualização à vista.
      </>
    ),
  },
  {
    q: "Nada fica sob consulta?",
    a: (
      <>
        Nada. Se o estacionamento tem preço na tabela, dá para reservar por aquele valor. O que
        aparece sem preço são as fichas mapeadas, de estacionamentos sem contrato, e isso está dito
        na própria linha.
      </>
    ),
  },
  {
    q: "O que é o preço riscado?",
    a: (
      <>
        É o balcão, a tarifa de quem chega sem reserva. Quando reservar online sai mais barato, a
        economia aparece na própria linha, em percentual.
      </>
    ),
  },
  {
    q: 'Por que algumas vagas mostram "mín. 3 diárias" no lugar do preço?',
    a: (
      <>
        Alguns parceiros só aceitam entrada a partir de 2 ou 3 diárias. Nesses casos a regra ocupa o
        lugar do preço da diária avulsa, e os preços de 7 e 15 diárias continuam valendo.
      </>
    ),
  },
  {
    q: "E os estacionamentos mapeados?",
    a: (
      <>
        São fichas que nossa equipe conferiu em campo: endereço e distância confirmados, sem
        contrato de reserva ainda. O preço é a tabela do local, cobrada na hora. A tabela completa
        de cada destino traz também o total de 30 diárias.
      </>
    ),
  },
];

const PROXIMOS = [
  {
    title: "Calcular para a minha viagem",
    sub: "O preço exato para as suas datas",
    to: "/calculadora-estacionamento-aeroporto",
    img: "/illustrations/il-destino-aeroporto.webp",
  },
  {
    title: "Buscar por data",
    sub: "Ver disponibilidade e reservar agora",
    to: "/search",
    img: "/illustrations/il-people-reserva-app.webp",
  },
  {
    title: "Como funciona a reserva",
    sub: "Do clique ao retorno do voo, em 7 passos",
    to: "/como-funciona",
    img: "/illustrations/il-people-viajante.webp",
  },
];

function nomeDoAeroporto(meta: AirportMeta): string {
  return meta.short_name ?? meta.name;
}

/**
 * A linha de uma vaga de parceiro.
 *
 * Os três períodos são renderizados SEMPRE, e só o ativo fica visível. O
 * seletor troca o que se lê, não o que existe no documento: esta é a página que
 * promete "o preço de cada estacionamento, sem consulta", e ela é pré-renderizada
 * num período só. Se o inativo saísse do DOM, dois terços dos preços do índice
 * não existiriam no HTML que o buscador e o crawler de IA leem.
 */
function LinhaDeVaga({
  row,
  posicao,
  menor,
  periodo,
}: {
  row: MatrixRow;
  posicao: number;
  menor: boolean;
  periodo: number;
}) {
  const distancia = formatDistance(row.unit.distance_m);

  return (
    <div className="grid grid-cols-1 items-center gap-3 border-t border-hairline p-4 tablet:grid-cols-[minmax(0,1fr)_128px_152px_auto] tablet:gap-5 tablet:px-5">
      <div className="flex min-w-0 items-center gap-3">
        <span
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-sm text-caption tabular-nums",
            menor ? "bg-mp-navy text-white" : "bg-surface-soft text-muted",
          )}
          aria-hidden
        >
          {String(posicao).padStart(2, "0")}
        </span>
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-title-md text-ink">
              {row.label} · {row.unit.parking_type_name}
            </span>
            {menor && (
              <span className="rounded-full bg-mp-teal px-2 py-0.5 text-badge uppercase tracking-[0.4px] text-mp-navy">
                Menor
              </span>
            )}
          </span>
          <span className="text-caption-sm text-muted">
            {distancia && <>{distancia} do terminal · </>}Parceiro Movepark
          </span>
        </span>
      </div>

      {/* Preço por diária e total, um bloco por período. */}
      {INDEX_PERIODS.map((p) => {
        const cell = row.cells.find((c) => c.days === p.days);
        const ativo = p.days === periodo;
        return (
          <React.Fragment key={p.days}>
            <div
              hidden={!ativo}
              className={cn("min-w-0 tablet:col-start-2", ativo && "flex flex-col gap-0.5")}
            >
              {cell?.perDay != null ? (
                <>
                  <span className="text-display-sm tabular-nums text-ink">
                    {formatBRL(p.days === 1 ? cell.total! : cell.perDay)}
                  </span>
                  <span className="text-caption-sm text-muted">{p.unit}</span>
                </>
              ) : (
                <span className="inline-flex w-fit items-center gap-2 rounded-full border border-dashed border-border-strong px-3 py-1.5">
                  <Info className="h-3.5 w-3.5 shrink-0 text-muted" aria-hidden />
                  <span className="text-caption-sm text-muted">
                    {cell?.minStayDays != null
                      ? `mín. ${cell.minStayDays} diárias`
                      : "ver na página"}
                  </span>
                </span>
              )}
            </div>

            <div
              hidden={!ativo}
              className={cn("min-w-0 tablet:col-start-3", ativo && "flex flex-col gap-0.5")}
            >
              {cell?.total != null && p.days > 1 && (
                <>
                  <span className="text-title-md tabular-nums text-ink">
                    total {formatBRL(cell.total)}
                  </span>
                  <span className="flex items-baseline gap-2">
                    {cell.oldTotal != null && (
                      <span className="text-caption-sm tabular-nums text-muted-steel line-through">
                        {formatBRL(cell.oldTotal)}
                      </span>
                    )}
                    {cell.economyPct != null && (
                      <span className="text-caption-sm font-semibold text-success">
                        &minus;{cell.economyPct}%
                      </span>
                    )}
                  </span>
                </>
              )}
              {cell?.total != null && p.days === 1 && cell.oldTotal != null && (
                <span className="flex items-baseline gap-2">
                  <span className="text-caption-sm tabular-nums text-muted-steel line-through">
                    {formatBRL(cell.oldTotal)}
                  </span>
                  {cell.economyPct != null && (
                    <span className="text-caption-sm font-semibold text-success">
                      &minus;{cell.economyPct}%
                    </span>
                  )}
                </span>
              )}
            </div>
          </React.Fragment>
        );
      })}

      <div className="tablet:col-start-4 tablet:justify-self-end">
        <Button asChild variant="outline" size="sm">
          <Link to={listingPath(row.unit)}>
            Reservar<span className="sr-only"> em {row.label}</span>
          </Link>
        </Button>
      </div>
    </div>
  );
}

/** O cartão de um aeroporto com parceiro precificado. */
function CartaoDeAeroporto({
  section,
  periodo,
  generatedAt,
}: {
  section: AirportSection;
  periodo: number;
  generatedAt: string;
}) {
  const { meta, dest, rows, hiddenPartnerCount } = section;
  const nome = nomeDoAeroporto(meta);
  const summary = dest ? destinationSummary(dest, [1, 7, 15]) : null;
  const metaSlug = meta.public_slug ?? meta.slug;
  const paginaPropria = dest ? caminhoPrecos(metaSlug) : caminhoDestino(metaSlug);
  const ordenadas = sortRowsByPeriod(rows, periodo);
  const menorKey = ordenadas.find((r) => r.cells.find((c) => c.days === periodo)?.perDay != null)
    ?.key;

  return (
    <section id={meta.slug} className={cn(CARTAO, "scroll-mt-24 overflow-hidden")}>
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 tablet:px-5">
        <div className="min-w-0">
          <h3 className="flex flex-wrap items-center gap-2">
            <Link to={paginaPropria} className="text-display-sm text-ink hover:text-mp-indigo">
              {nome}
            </Link>
            {meta.state && (
              <span className="rounded-full border border-hairline px-2 py-0.5 text-badge uppercase tracking-[0.4px] text-muted-steel">
                {meta.state}
              </span>
            )}
          </h3>
          <p className="mt-1 text-caption-sm text-muted">
            {rows.length === 1 ? "1 vaga de parceiro" : `${rows.length} vagas de parceiros`} ·
            ordenado pelo menor preço de {periodLabel(periodo)}
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to={paginaPropria}>
            Tabela completa<span className="sr-only"> de {nome}</span>
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </Button>
      </div>

      {ordenadas.map((row, i) => (
        <LinhaDeVaga
          key={row.key}
          row={row}
          posicao={i + 1}
          menor={row.key === menorKey}
          periodo={periodo}
        />
      ))}

      <p className="border-t border-hairline p-4 text-caption-sm text-muted-steel tablet:px-5">
        Motor de reservas Movepark, o mesmo preço do checkout · conferido em{" "}
        <time dateTime={generatedAt}>{formatDate(generatedAt)}</time>
        {summary?.lastUpdated && (
          <>
            {" "}
            · tabela do parceiro de{" "}
            <time dateTime={summary.lastUpdated}>{formatDate(summary.lastUpdated)}</time>
          </>
        )}
        {hiddenPartnerCount > 0 && (
          <>
            {" · "}
            <Link
              to={paginaPropria}
              className="font-semibold text-mp-indigo underline-offset-2 hover:underline"
            >
              mais {hiddenPartnerCount} {hiddenPartnerCount === 1 ? "vaga" : "vagas"} na tabela
              completa
            </Link>
          </>
        )}
      </p>
    </section>
  );
}

/**
 * Índice de preços (/precos): todos os aeroportos publicados, separados por
 * aquilo que a Movepark consegue prometer em cada um. Pré-renderizado no build
 * com os filtros vazios, então o HTML sai completo para o crawler.
 */
export default function PrecosPage() {
  const loaded = useLoaderData() as PrecosIndexData | null;

  const [busca, setBusca] = React.useState("");
  const [uf, setUf] = React.useState<string | null>(null);
  const [soComReserva, setSoComReserva] = React.useState(false);
  const [periodo, setPeriodo] = React.useState<number>(INDEX_DEFAULT_PERIOD);
  const idBusca = React.useId();
  const idUf = React.useId();

  const sections = React.useMemo(
    () => (loaded ? buildAirportSections(loaded.aeroportos, loaded.data, loaded.prospects, 5) : []),
    [loaded],
  );

  if (!loaded || sections.length === 0) {
    return (
      <div className={cn(CONTAINER, "py-16")}>
        <EmptyState
          title="Índice de preços indisponível"
          description="Sem dados de preço agora. Busque por data para ver os valores das vagas."
          action={
            <Link to="/search" className="text-mp-primary underline">
              Buscar estacionamento
            </Link>
          }
        />
      </div>
    );
  }

  const { data, aeroportos, generatedAt } = loaded;
  const filtro: AirportFilter = { busca, uf, soComReserva };
  const visiveis = sections.filter((s) => matchesAirportFilter(s, filtro));
  const filtrando = busca.trim() !== "" || uf != null || soComReserva;
  const ufs = airportStates(aeroportos);
  const grupos = groupAirports(visiveis);

  const stats = overallStats(data);
  const menorDiaria = minPerDay(data, periodo);
  const listados = sections.reduce((acc, s) => {
    const locais = new Set(s.rows.map((r) => `${r.unit.company_slug}/${r.unit.location_slug}`));
    return acc + locais.size + s.mapeados.length;
  }, 0);
  const mapeadosNoGrupo = grupos.mapeados.reduce(
    (n, s) => n + s.mapeados.length + s.hiddenProspectCount,
    0,
  );

  const canonical = `${SITE_URL}/precos`;
  const titulo = "Índice de preços de estacionamento";

  const breadcrumb = breadcrumbSchema([
    { name: "Início", url: SITE_URL },
    { name: "Índice de preços", url: canonical },
  ]);
  const lista = itemListSchema(
    sections.map((s) => ({
      name: `Preços de estacionamento em ${nomeDoAeroporto(s.meta)}`,
      url: `${SITE_URL}${
        s.dest
          ? caminhoPrecos(s.meta.public_slug ?? s.meta.slug)
          : caminhoDestino(s.meta.public_slug ?? s.meta.slug)
      }`,
    })),
  );

  const limparFiltros = () => {
    setBusca("");
    setUf(null);
    setSoComReserva(false);
  };

  const campo =
    "h-12 w-full rounded-sm border border-hairline bg-canvas px-3 text-body-md text-ink focus:border-mp-primary focus:outline-none";

  return (
    <>
      <Helmet>
        <title>{`${titulo}: diária, 7 e 15 dias por aeroporto | Movepark`}</title>
        <meta name="description" content={DESCRIPTION} />
        <link rel="canonical" href={canonical} />
        <meta property="og:type" content="website" />
        <meta property="og:title" content={`${titulo} | Movepark`} />
        <meta property="og:description" content={DESCRIPTION} />
        <meta property="og:url" content={canonical} />
        <script type="application/ld+json">{JSON.stringify(breadcrumb)}</script>
        <script type="application/ld+json">{JSON.stringify(lista)}</script>
        <script type="application/ld+json">{JSON.stringify(datasetSchema({ dateModified: generatedAt, spatial: aeroportos.map((a) => a.name) }))}</script>
      </Helmet>
      <OgImage area="precos" />

      {/* O violeta cai na promessa da página, não em enfeite. Sobre navy ele usa
          o tom claro, porque o `mp-violet` daria 2.3:1 e reprovaria. */}
      <PageHero
        className="pb-8 desktop:pb-10"
        breadcrumb={
          <Breadcrumb
            tom="escuro"
            items={[{ label: "Início", to: "/" }, { label: "Índice de preços" }]}
          />
        }
        title={
          <>
            O preço de cada estacionamento,{" "}
            <span className="text-mp-violet-on-navy">sem consulta</span>
          </>
        }
        description="Todos os aeroportos numa página. Se tem preço na tabela, dá para reservar por aquele valor: é o mesmo do checkout."
      />

      {/* O retrato do índice em quatro números, montado sobre a borda da faixa. */}
      <div className={cn(CONTAINER, "relative z-10 -mt-16 desktop:-mt-20")}>
        <dl
          className={cn(
            CARTAO,
            "grid grid-cols-1 gap-x-6 p-5 shadow-tier tablet:grid-cols-4 desktop:p-7",
          )}
        >
          {[
            { valor: String(sections.length), rotulo: "Aeroportos no índice", forte: false },
            { valor: String(listados), rotulo: "Estacionamentos listados", forte: false },
            {
              valor: menorDiaria != null ? formatBRL(menorDiaria) : "varia",
              rotulo: `Menor diária hoje, em ${periodLabel(periodo)}`,
              forte: false,
            },
            {
              valor: stats.maxEconomyPct != null ? `até ${stats.maxEconomyPct}%` : "varia",
              rotulo: "Economia sobre o balcão",
              forte: true,
            },
          ].map((s, i) => (
            <div
              key={s.rotulo}
              className={cn(
                // `flex-col-reverse` põe o número em cima SEM inverter o DOM: a
                // lista de definição continua sendo termo (rótulo) e depois
                // valor, que é a ordem que o leitor de tela anuncia.
                "flex flex-col-reverse justify-end gap-1 py-3 tablet:py-0",
                i > 0 && "border-t border-hairline tablet:border-l tablet:border-t-0 tablet:pl-6",
                i === 0 && "pt-0",
                i === 3 && "pb-0",
              )}
            >
              <dt className="text-pretty text-caption-sm text-muted">{s.rotulo}</dt>
              <dd
                className={cn(
                  "text-display-sm tabular-nums",
                  s.forte ? "text-success" : "text-mp-navy",
                )}
              >
                {s.valor}
              </dd>
            </div>
          ))}
        </dl>
      </div>

      {/* Filtros. Ficam numa faixa acima dos resultados, e não numa lateral fixa:
          o seletor de período muda todos os números da página de uma vez, e como
          controle global ele precisa estar na mesma linha de leitura do título do
          grupo que ele governa. */}
      <div className={cn(CONTAINER, "pt-8 desktop:pt-10")}>
        <div className={cn(CARTAO, "flex flex-col gap-5 p-4 desktop:p-6")}>
          <div className="grid grid-cols-1 gap-4 tablet:grid-cols-[minmax(0,1fr)_200px]">
            <div className="flex flex-col gap-1.5">
              <label htmlFor={idBusca} className="text-caption font-semibold text-ink">
                Buscar aeroporto
              </label>
              <input
                id={idBusca}
                type="search"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Nome, cidade ou código"
                className={campo}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor={idUf} className="text-caption font-semibold text-ink">
                Estado
              </label>
              <select
                id={idUf}
                value={uf ?? ""}
                onChange={(e) => setUf(e.target.value === "" ? null : e.target.value)}
                className={campo}
              >
                <option value="">Todos os estados</option>
                {ufs.map((sigla) => (
                  <option key={sigla} value={sigla}>
                    {sigla}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-wrap items-end justify-between gap-5">
            <div className="flex flex-col gap-1.5">
              <span id={`${idBusca}-periodo`} className="text-caption font-semibold text-ink">
                Mostrar preço de
              </span>
              <div
                role="group"
                aria-labelledby={`${idBusca}-periodo`}
                className="flex flex-wrap gap-2"
              >
                {INDEX_PERIODS.map((p) => {
                  const on = p.days === periodo;
                  return (
                    <button
                      key={p.days}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setPeriodo(p.days)}
                      className={cn(
                        "rounded-full border px-4 py-2.5 text-button-sm transition",
                        on
                          ? "border-mp-navy bg-mp-navy text-white"
                          : "border-hairline bg-canvas text-body hover:border-mp-navy",
                      )}
                    >
                      {p.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <label className="flex cursor-pointer items-center gap-2.5 text-body-sm text-ink">
              <input
                type="checkbox"
                checked={soComReserva}
                onChange={(e) => setSoComReserva(e.target.checked)}
                className="h-4 w-4 accent-mp-primary"
              />
              Só com reserva online
            </label>
          </div>
        </div>
      </div>

      <div className={cn(CONTAINER, "flex flex-col gap-10 pt-10 desktop:gap-14 desktop:pt-12")}>
        {grupos.comReserva.length > 0 && (
          <section className="flex flex-col gap-4">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <h2 className="text-balance text-display-2xl text-ink">
                Com reserva online
                {filtrando && ` · ${grupos.comReserva.length}`}
              </h2>
              <p className="text-caption-sm text-muted" role="status">
                Preço de {periodLabel(periodo)} · conferido em{" "}
                <time dateTime={generatedAt}>{formatDate(generatedAt)}</time>
              </p>
            </div>
            {grupos.comReserva.map((s) => (
              <CartaoDeAeroporto
                key={s.meta.slug}
                section={s}
                periodo={periodo}
                generatedAt={generatedAt}
              />
            ))}
          </section>
        )}

        {grupos.mapeados.length > 0 && (
          <section className="flex flex-col gap-4 border-t border-hairline pt-10 desktop:pt-12">
            <div>
              <h2 className="text-balance text-display-2xl text-ink">
                Mapeados, sem reserva online
              </h2>
              <p className="mt-2 max-w-[56ch] text-pretty text-body-md text-body">
                {mapeadosNoGrupo}{" "}
                {mapeadosNoGrupo === 1 ? "estacionamento que" : "estacionamentos que"} nossa equipe
                conferiu em campo: endereço e distância confirmados, com o preço na tabela do local.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-3 tablet:grid-cols-2">
              {grupos.mapeados.map((s) => {
                const total = s.mapeados.length + s.hiddenProspectCount;
                return (
                  <div
                    key={s.meta.slug}
                    id={s.meta.slug}
                    className={cn(CARTAO, "flex scroll-mt-24 flex-col gap-3 p-4")}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="min-w-0">
                        <Link
                          to={caminhoDestino(s.meta.public_slug ?? s.meta.slug)}
                          className="text-title-md text-ink hover:text-mp-indigo"
                        >
                          {nomeDoAeroporto(s.meta)}
                        </Link>
                      </h3>
                      {s.meta.state && (
                        <span className="shrink-0 rounded-full border border-hairline px-2 py-0.5 text-badge uppercase tracking-[0.4px] text-muted-steel">
                          {s.meta.state}
                        </span>
                      )}
                    </div>
                    <ul className="flex flex-col gap-1.5">
                      {s.mapeados.map((p) => (
                        <li key={p.slug} className="flex items-baseline gap-2">
                          <span
                            className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-muted-steel"
                            aria-hidden
                          />
                          <span className="text-pretty text-body-sm text-body">
                            {p.name}
                            {p.distance_km != null && (
                              <span className="text-muted">
                                {" · "}
                                {formatDistance(Math.round(p.distance_km * 1000))}
                              </span>
                            )}
                          </span>
                        </li>
                      ))}
                    </ul>
                    <Link
                      to={caminhoDestino(s.meta.public_slug ?? s.meta.slug)}
                      className="mt-auto text-body-sm font-semibold text-mp-indigo underline-offset-2 hover:underline"
                    >
                      Ver {total === 1 ? "a ficha" : `os ${total}`} no destino
                    </Link>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {grupos.aindaMapeando.length > 0 && (
          <section className="flex flex-col gap-4 border-t border-hairline pt-10 desktop:pt-12">
            <div>
              <h2 className="text-balance text-display-2xl text-ink">Ainda mapeando</h2>
              <p className="mt-2 max-w-[56ch] text-pretty text-body-md text-body">
                {grupos.aindaMapeando.length === 1
                  ? "Neste aeroporto ainda não temos estacionamento cadastrado."
                  : `Nestes ${grupos.aindaMapeando.length} aeroportos ainda não temos estacionamento cadastrado.`}{" "}
                Tem um na região?
              </p>
            </div>
            <ul className="flex flex-wrap gap-2">
              {grupos.aindaMapeando.map((s) => (
                <li key={s.meta.slug}>
                  <Link
                    to={caminhoDestino(s.meta.public_slug ?? s.meta.slug)}
                    className="inline-block rounded-full border border-hairline px-4 py-2 text-body-sm text-body transition hover:border-mp-navy hover:text-ink"
                  >
                    {nomeDoAeroporto(s.meta)}
                  </Link>
                </li>
              ))}
            </ul>
            <div className="mt-2 flex flex-col items-start gap-4 rounded-lg border border-hairline bg-surface-soft p-5 tablet:flex-row tablet:items-center tablet:justify-between">
              <div className="min-w-0">
                <p className="text-pretty text-title-md text-ink">
                  Tem um estacionamento perto de um desses aeroportos?
                </p>
                <p className="mt-1 text-pretty text-body-sm text-body">
                  Publicamos sua tabela no índice e você recebe reservas pagas com antecedência.
                </p>
              </div>
              <Button asChild className="shrink-0">
                <Link to="/seja-parceiro">Seja parceiro</Link>
              </Button>
            </div>
          </section>
        )}

        {visiveis.length === 0 && (
          <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border-strong px-6 py-12 text-center">
            <MagnifyingGlass className="h-8 w-8 text-muted-soft" aria-hidden />
            <p className="text-title-md text-ink">Nenhum aeroporto com esse filtro</p>
            <p className="max-w-[40ch] text-pretty text-body-md text-body">
              Tente outro nome, outro estado, ou desmarque &quot;só com reserva online&quot;.
            </p>
            <Button variant="outline" onClick={limparFiltros} className="mt-1">
              Limpar filtros
            </Button>
          </div>
        )}

        {visiveis.length > 0 && filtrando && (
          <button
            type="button"
            onClick={limparFiltros}
            className="self-start text-body-sm font-semibold text-mp-indigo underline-offset-2 hover:underline"
          >
            Limpar filtros
          </button>
        )}
      </div>

      <section className={cn(CONTAINER, "pt-12 desktop:pt-16")}>
        <div className={cn(CARTAO, "p-5 desktop:p-8")}>
          <h2 className="text-balance text-display-sm text-ink">De onde vêm estes preços</h2>
          <Accordion type="single" collapsible defaultValue="m-0" className="mt-2">
            {METODOLOGIA.map((m, i) => (
              <AccordionItem key={m.q} value={`m-${i}`}>
                <AccordionTrigger>{m.q}</AccordionTrigger>
                <AccordionContent forceMount className="max-w-[68ch] text-pretty">
                  {m.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
          <p className="mt-5 text-pretty text-caption-sm text-muted">
            Conferido no motor de reservas em{" "}
            <time dateTime={generatedAt}>{formatDate(generatedAt)}</time>.
          </p>
          {/* Engenharia de citabilidade: licença clara reduz o atrito de imprensa
              e IA citarem o número com o nosso nome junto. */}
          <p className="mt-3 text-pretty text-caption-sm text-muted">
            Para imprensa e citação: reprodução livre com atribuição a "Índice Movepark de
            Preços (movepark.co)". Os dados são contínuos, direto do motor de reservas; a
            versão em texto vive em movepark.co/llms-full.txt. Contato: contato@movepark.co.
          </p>
        </div>
      </section>

      <section className={cn(CONTAINER, "pb-16 pt-12 desktop:pb-24 desktop:pt-16")}>
        <h2 className="text-balance text-display-2xl text-ink">E agora</h2>
        <div className="mt-4 grid gap-3 tablet:grid-cols-3">
          {PROXIMOS.map((p) => (
            <Link
              key={p.to}
              to={p.to}
              className={cn(CARTAO, "flex items-center gap-4 p-5 transition hover:shadow-tier")}
            >
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="text-pretty text-title-md text-ink">{p.title}</span>
                <span className="text-pretty text-caption-sm text-muted">{p.sub}</span>
                <ArrowRight className="mt-1 h-4 w-4 text-mp-indigo" aria-hidden />
              </span>
              <img
                src={p.img}
                alt=""
                loading="lazy"
                className="h-16 w-16 shrink-0 rounded-full bg-surface-strong object-cover"
              />
            </Link>
          ))}
        </div>
      </section>
    </>
  );
}
