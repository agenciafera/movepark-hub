import * as React from "react";
import { Link, useLoaderData } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/EmptyState";
import { PageHeader } from "@/components/shared/PageHeader";
import { formatBRL, formatDate } from "@/lib/format";
import { breadcrumbSchema } from "@/lib/jsonld";
import { cn } from "@/lib/utils";
import { fetchPriceForDays } from "@/features/price-index/api";
import {
  CALC_MAX_DAYS,
  CALC_MIN_DAYS,
  CALC_QUICK_DAYS,
  calcResults,
  sanitizeDays,
  type CalcResult,
} from "@/features/price-index/calculadora.logic";
import {
  durationLabel,
  formatDistance,
  listingPath,
  type PriceDestination,
  type PriceIndexData,
} from "@/features/price-index/priceIndex.logic";

const SITE_URL = "https://hub.movepark.co";

/** Lote mapeado pela Movepark, ainda sem contrato: aparece sem preço (ADR-010). */
export type CalculadoraProspect = {
  name: string;
  slug: string;
  distance_km: number | null;
};

export type CalculadoraData = {
  data: PriceIndexData;
  /** Lotes mapeados por slug de destino, para a lista ficar completa como a do concorrente. */
  prospects: Record<string, CalculadoraProspect[]>;
  generatedAt: string;
};

const DESCRIPTION =
  "Escolha o aeroporto e o número de diárias e veja quanto custa em cada estacionamento, " +
  "do mais barato ao mais caro. Parceiros Movepark reservam online pelo preço do checkout.";

const celulaBase = "tablet:table-cell tablet:border-b tablet:border-hairline tablet:px-3 tablet:py-5 tablet:align-top";

/**
 * Calculadora de estacionamento (/calculadora-estacionamento-aeroporto):
 * destino + diárias viram o ranking real do motor, na estrutura editorial de
 * tabela ranqueada. Parceiros Movepark vêm primeiro, com Reservar em destaque;
 * lotes mapeados sem contrato fecham a lista sem preço, com a ficha (ADR-010).
 * As durações da matriz padrão (1/7/15/30) respondem na hora com o dado do
 * build; qualquer outra vai ao motor pela mesma RPC pública. O estado inicial
 * (primeiro destino, 7 diárias) é pré-renderizado.
 */
export default function CalculadoraPage() {
  const loaded = useLoaderData() as CalculadoraData | null;

  const destinations = loaded?.data.destinations ?? [];
  const standardDays = loaded?.data.days ?? [1, 7, 15, 30];

  const [slug, setSlug] = React.useState(destinations[0]?.slug ?? "");
  const [daysInput, setDaysInput] = React.useState("7");
  const [result, setResult] = React.useState<CalcResult | null>(() =>
    destinations[0] ? calcResults(destinations[0], 7) : null,
  );
  const [carregando, setCarregando] = React.useState(false);
  const [erro, setErro] = React.useState<string | null>(null);
  // Consultas de duração fora da matriz padrão, para não repetir a ida ao motor.
  const consultasRef = React.useRef(new Map<string, PriceDestination>());
  // Cálculo ao vivo: digitou ou arrastou, calcula sozinho depois de uma pausa curta.
  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const destino = destinations.find((d) => d.slug === slug) ?? null;
  const nome = destino ? (destino.short_name ?? destino.name) : "";
  const mapeados = loaded?.prospects[slug] ?? [];

  const calcular = React.useCallback(
    async (destSlug: string, diasBrutos: string) => {
      const dias = sanitizeDays(diasBrutos);
      const dest = destinations.find((d) => d.slug === destSlug) ?? null;
      if (!dest) return;
      if (dias == null) {
        setErro(`Informe de ${CALC_MIN_DAYS} a ${CALC_MAX_DAYS} diárias.`);
        return;
      }
      setErro(null);
      if (standardDays.includes(dias)) {
        setResult(calcResults(dest, dias));
        return;
      }
      const chave = `${destSlug}:${dias}`;
      const memo = consultasRef.current.get(chave);
      if (memo) {
        setResult(calcResults(memo, dias));
        return;
      }
      setCarregando(true);
      try {
        const vivo = await fetchPriceForDays(destSlug, dias);
        if (vivo) {
          consultasRef.current.set(chave, vivo);
          setResult(calcResults(vivo, dias));
        } else {
          setResult({ days: dias, priced: [], blocked: [] });
        }
      } catch {
        setErro("A consulta falhou. Tente de novo em instantes.");
      } finally {
        setCarregando(false);
      }
    },
    [destinations, standardDays],
  );

  /** Digitou ou arrastou: calcula sozinho depois de uma pausa curta, sem botão. */
  const aoMudarDias = (valor: string) => {
    setDaysInput(valor);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => void calcular(slug, valor), 400);
  };

  if (!loaded || destinations.length === 0) {
    return (
      <div className="mx-auto w-full max-w-[1080px] px-4 py-16">
        <EmptyState
          title="Calculadora indisponível"
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

  const canonical = `${SITE_URL}/calculadora-estacionamento-aeroporto`;
  const titulo = "Calculadora de estacionamento de aeroporto";
  const breadcrumb = breadcrumbSchema([
    { name: "Início", url: SITE_URL },
    { name: "Índice de preços", url: `${SITE_URL}/precos` },
    { name: "Calculadora", url: canonical },
  ]);

  return (
    <>
      <Helmet>
        <title>{`${titulo}: quanto custa por diárias | Movepark`}</title>
        <meta name="description" content={DESCRIPTION} />
        <link rel="canonical" href={canonical} />
        <meta property="og:type" content="website" />
        <meta property="og:title" content={`${titulo} | Movepark`} />
        <meta property="og:description" content={DESCRIPTION} />
        <meta property="og:url" content={canonical} />
        <script type="application/ld+json">{JSON.stringify(breadcrumb)}</script>
      </Helmet>

      <div className="mx-auto w-full max-w-[1080px] px-4 py-12">
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
              <Link to="/precos" className="hover:text-ink">
                Índice de preços
              </Link>
            </li>
            <li aria-hidden className="text-muted-steel">
              ›
            </li>
            <li aria-current="page" className="text-ink">
              Calculadora
            </li>
          </ol>
        </nav>

        <PageHeader
          variant="content"
          eyebrow="Índice de preços"
          title={titulo}
          description="Escolha o destino e o número de diárias. O ranking sai do motor de reservas, do mais barato ao mais caro, com o balcão ao lado."
        >
          <p className="text-caption-sm text-muted">
            Conferido no motor de reservas em{" "}
            <time dateTime={loaded.generatedAt}>{formatDate(loaded.generatedAt)}</time>
          </p>
        </PageHeader>

        <form
          noValidate
          className="mt-8 rounded-lg border border-hairline p-5 tablet:p-6"
          onSubmit={(e) => {
            e.preventDefault();
            void calcular(slug, daysInput);
          }}
        >
          <div className="grid gap-6 tablet:grid-cols-[minmax(0,5fr)_minmax(0,5fr)_minmax(0,4fr)] tablet:items-end">
            <label className="flex min-w-0 flex-col gap-1.5">
              <span className="text-caption-sm font-medium text-muted">Destino</span>
              <select
                value={slug}
                onChange={(e) => {
                  setSlug(e.target.value);
                  void calcular(e.target.value, daysInput);
                }}
                className="h-12 w-full rounded-sm border border-hairline bg-canvas px-3 text-body-md text-ink focus:border-mp-primary focus:outline-none"
              >
                {destinations.map((d) => (
                  <option key={d.slug} value={d.slug}>
                    {d.short_name ?? d.name}
                  </option>
                ))}
              </select>
            </label>

            <div className="flex min-w-0 flex-col gap-1.5">
              <span className="text-caption-sm font-medium text-muted" id="rotulo-diarias">
                Diárias (1 a 60)
              </span>
              <div className="flex h-12 items-center gap-4">
                <input
                  type="range"
                  min={CALC_MIN_DAYS}
                  max={CALC_MAX_DAYS}
                  value={sanitizeDays(daysInput) ?? CALC_MIN_DAYS}
                  onChange={(e) => aoMudarDias(e.target.value)}
                  aria-label="Diárias (arraste)"
                  className="w-full min-w-0 accent-mp-primary"
                />
                <input
                  type="number"
                  inputMode="numeric"
                  min={CALC_MIN_DAYS}
                  max={CALC_MAX_DAYS}
                  value={daysInput}
                  onChange={(e) => aoMudarDias(e.target.value)}
                  aria-label="Diárias"
                  aria-describedby="rotulo-diarias"
                  className="h-12 w-20 shrink-0 rounded-sm border border-hairline bg-canvas px-3 text-center text-body-md tabular-nums text-ink focus:border-mp-primary focus:outline-none"
                />
              </div>
            </div>

            <div className="tablet:text-right" aria-live="polite">
              <span className="text-caption-sm font-medium text-muted">Resultado</span>
              <p className="mt-1.5 text-title-md text-ink">
                {carregando
                  ? "Calculando…"
                  : result
                    ? `${result.priced.length} de ${result.priced.length + result.blocked.length + mapeados.length} com reserva online`
                    : "Escolha o destino"}
              </p>
            </div>
          </div>
        </form>

        <div className="mt-3 flex flex-wrap items-center gap-2" aria-label="Durações comuns">
          {CALC_QUICK_DAYS.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => {
                setDaysInput(String(d));
                void calcular(slug, String(d));
              }}
              className={cn(
                "rounded-full border px-3 py-1.5 text-body-sm transition",
                result?.days === d && !carregando
                  ? "border-mp-primary text-mp-primary"
                  : "border-hairline text-ink hover:border-mp-primary hover:text-mp-primary",
              )}
            >
              {durationLabel(d)}
            </button>
          ))}
        </div>

        {erro && (
          <p className="mt-4 text-body-sm text-mp-red" role="alert">
            {erro}
          </p>
        )}

        {result && destino && (
          <section className="mt-10" aria-live="polite">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <h2 className="text-display-sm text-ink">
                {durationLabel(result.days)} em {nome}
              </h2>
              <p className="text-body-sm text-muted">
                {result.priced.length}{" "}
                {result.priced.length === 1 ? "opção com reserva online" : "opções com reserva online"}
                {mapeados.length > 0 && <> · {mapeados.length} sem contrato ainda</>}
              </p>
            </div>

            {result.priced.length === 0 && result.blocked.length === 0 ? (
              <p className="mt-3 text-body-md text-body">
                Nenhum parceiro cota {durationLabel(result.days)} nesse destino. Veja a{" "}
                <Link
                  to={`/precos/${destino.slug}`}
                  className="font-medium text-mp-indigo underline-offset-2 hover:underline"
                >
                  tabela completa
                </Link>{" "}
                ou busque por data.
              </p>
            ) : (
              <table className="mt-4 block w-full border-collapse tablet:table">
                <caption className="sr-only">
                  Preço de {durationLabel(result.days)} de estacionamento em {nome}
                </caption>
                <thead className="hidden tablet:table-header-group">
                  <tr>
                    <th
                      scope="col"
                      className="w-10 border-b border-hairline py-2 pr-2 text-left text-caption-sm font-medium text-muted"
                    >
                      Nº
                    </th>
                    <th
                      scope="col"
                      className="border-b border-hairline py-2 pr-3 text-left text-caption-sm font-medium text-muted"
                    >
                      Estacionamento
                    </th>
                    <th
                      scope="col"
                      className="border-b border-hairline px-3 py-2 text-left text-caption-sm font-medium text-muted"
                    >
                      R$ por dia
                    </th>
                    <th
                      scope="col"
                      className="border-b border-hairline px-3 py-2 text-left text-caption-sm font-medium text-muted"
                    >
                      Total ({durationLabel(result.days)})
                    </th>
                    <th
                      scope="col"
                      className="border-b border-hairline py-2 pl-3 text-left text-caption-sm font-medium text-muted"
                    >
                      Reserva
                    </th>
                  </tr>
                </thead>
                <tbody className="block space-y-3 tablet:table-row-group">
                  {result.priced.map(({ row, cell }, i) => (
                    <tr
                      key={row.key}
                      className={cn(
                        "grid grid-cols-2 gap-x-4 gap-y-3 rounded-lg border p-4 tablet:table-row tablet:p-0",
                        i === 0 ? "border-mp-primary bg-mp-pale/60" : "border-hairline tablet:border-0",
                      )}
                    >
                      <td className={cn("hidden text-caption-sm tabular-nums text-muted", celulaBase, "tablet:pl-0 tablet:pr-2")}>
                        {String(i + 1).padStart(2, "0")}
                      </td>
                      <td className={cn("order-1 col-span-2", celulaBase, "tablet:px-0 tablet:pr-3")}>
                        <div className="flex flex-col gap-0.5">
                          <span className="text-title-md text-ink">
                            <span className="mr-1.5 text-caption-sm tabular-nums text-muted tablet:hidden">
                              {String(i + 1).padStart(2, "0")}
                            </span>
                            {row.label}
                            {i === 0 && (
                              <span className="ml-2 inline-block rounded-full bg-mp-primary px-2 py-0.5 align-middle text-badge uppercase text-white">
                                menor preço
                              </span>
                            )}
                          </span>
                          <span className="text-caption-sm text-muted">
                            {row.unit.parking_type_name}
                            {formatDistance(row.unit.distance_m) && (
                              <> · {formatDistance(row.unit.distance_m)}</>
                            )}
                            {" · "}Parceiro Movepark
                          </span>
                          <Link
                            to={listingPath(row.unit)}
                            className="text-caption-sm font-medium text-mp-indigo underline underline-offset-4"
                          >
                            Ver ficha
                          </Link>
                        </div>
                      </td>
                      <td className={cn("order-3", celulaBase)}>
                        <span className="block text-caption-sm text-muted tablet:hidden">
                          R$ por dia
                        </span>
                        <span className="block text-title-md tabular-nums text-ink">
                          {formatBRL(cell.perDay)}
                        </span>
                        {cell.economyPct != null && (
                          <span className="mt-1 inline-block rounded-full bg-success/10 px-2 py-0.5 text-caption-sm font-medium text-success">
                            reserva online: {cell.economyPct}% menor
                          </span>
                        )}
                      </td>
                      <td className={cn("order-4", celulaBase)}>
                        <span className="block text-caption-sm text-muted tablet:hidden">
                          Total ({durationLabel(result.days)})
                        </span>
                        {cell.oldTotal != null && (
                          <span className="block text-caption-sm text-muted line-through tabular-nums">
                            {formatBRL(cell.oldTotal)}
                          </span>
                        )}
                        <span className="block text-title-md tabular-nums text-ink">
                          {formatBRL(cell.total)}
                        </span>
                      </td>
                      <td className={cn("order-2 col-span-2 justify-self-stretch", celulaBase, "tablet:pl-3 tablet:align-middle")}>
                        <Button asChild className="w-full tablet:w-auto">
                          <Link to={listingPath(row.unit)}>Reservar</Link>
                        </Button>
                      </td>
                    </tr>
                  ))}

                  {result.blocked.map(({ row, cell }) => (
                    <tr
                      key={row.key}
                      className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-lg border border-hairline p-4 tablet:table-row tablet:border-0 tablet:p-0"
                    >
                      <td className={cn("hidden", celulaBase, "tablet:pl-0 tablet:pr-2")} />
                      <td className={cn("order-1 col-span-2", celulaBase, "tablet:px-0 tablet:pr-3")}>
                        <div className="flex flex-col gap-0.5">
                          <span className="text-title-md text-ink">{row.label}</span>
                          <span className="text-caption-sm text-muted">
                            {row.unit.parking_type_name}
                            {formatDistance(row.unit.distance_m) && (
                              <> · {formatDistance(row.unit.distance_m)}</>
                            )}
                            {" · "}Parceiro Movepark
                          </span>
                          <Link
                            to={listingPath(row.unit)}
                            className="text-caption-sm font-medium text-mp-indigo underline underline-offset-4"
                          >
                            Ver ficha
                          </Link>
                        </div>
                      </td>
                      <td className={cn("order-3 col-span-2", celulaBase)} colSpan={2}>
                        <span className="block text-body-sm text-muted">
                          entrada a partir de {cell.minStayDays} diárias
                        </span>
                      </td>
                      <td className={cn("order-4 col-span-2", celulaBase, "tablet:pl-3")}>
                        <span className="block text-caption-sm text-muted">
                          reserve a partir de {cell.minStayDays} diárias
                        </span>
                      </td>
                    </tr>
                  ))}

                  {mapeados.map((p) => (
                    <tr
                      key={p.slug}
                      className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-lg border border-dashed border-hairline p-4 tablet:table-row tablet:border-0 tablet:p-0"
                    >
                      <td className={cn("hidden", celulaBase, "tablet:pl-0 tablet:pr-2")} />
                      <td className={cn("order-1 col-span-2", celulaBase, "tablet:px-0 tablet:pr-3")}>
                        <div className="flex flex-col gap-0.5">
                          <span className="text-title-md text-ink">{p.name}</span>
                          <span className="text-caption-sm text-muted">
                            {p.distance_km != null && (
                              <>{formatDistance(Math.round(p.distance_km * 1000))} · </>
                            )}
                            mapeado pela Movepark
                          </span>
                          <Link
                            to={`/estacionamentos/${destino.slug}/${p.slug}`}
                            className="text-caption-sm font-medium text-mp-indigo underline underline-offset-4"
                          >
                            Ver ficha
                          </Link>
                        </div>
                      </td>
                      <td className={cn("order-3 col-span-2", celulaBase)} colSpan={2}>
                        <span className="block text-body-sm text-muted">
                          consulte a tabela no local
                        </span>
                      </td>
                      <td className={cn("order-4 col-span-2", celulaBase, "tablet:pl-3")}>
                        <span className="block text-caption-sm text-muted">sem reserva online</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            <p className="mt-3 text-caption-sm text-muted">
              Preços do motor de reservas Movepark, os mesmos do checkout. Estacionamento sem
              reserva online é ficha mapeada pela nossa equipe: o preço é a tabela do local.{" "}
              <a
                href="#como-funciona"
                className="font-medium text-mp-indigo underline-offset-2 hover:underline"
              >
                Como a calculadora funciona
              </a>
            </p>
          </section>
        )}

        <section id="como-funciona" className="mt-12 max-w-[720px] scroll-mt-24">
          <h2 className="text-display-sm text-ink">Como a calculadora funciona</h2>
          <p className="mt-3 text-body-md text-body">
            O valor de cada vaga sai do motor de preços da Movepark, o mesmo que fecha a reserva
            no checkout: a tabela vigente do parceiro aplicada ao número de diárias que você
            escolheu, sem estimativa.
          </p>
          <p className="mt-3 text-body-md text-body">
            O preço riscado é o balcão, a tarifa de quem chega sem reservar. Estacionamentos
            mapeados sem contrato aparecem no fim da lista, sem preço: a ficha mostra endereço e
            comodidades, e a tabela é a do local. Para comparar os destinos lado a lado, veja o{" "}
            <Link
              to="/precos"
              className="font-medium text-mp-indigo underline-offset-2 hover:underline"
            >
              índice de preços
            </Link>
            .
          </p>
        </section>
      </div>
    </>
  );
}
