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

export type CalculadoraData = {
  data: PriceIndexData;
  generatedAt: string;
};

const DESCRIPTION =
  "Escolha o aeroporto e o número de diárias e veja quanto custa em cada estacionamento " +
  "parceiro, do mais barato ao mais caro. O valor é o mesmo do checkout.";

/**
 * Calculadora de estacionamento (/calculadora-estacionamento-aeroporto):
 * destino + diárias viram o ranking real do motor. As durações da matriz padrão
 * (1/7/15/30) respondem na hora com o dado do build; qualquer outra vai ao motor
 * pela mesma RPC pública, com uma duração só. O estado inicial (primeiro destino,
 * 7 diárias) é pré-renderizado, então o crawler vê resultado de verdade.
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

  const destino = destinations.find((d) => d.slug === slug) ?? null;
  const nome = destino ? (destino.short_name ?? destino.name) : "";

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
          className="mt-8 flex flex-col gap-4 rounded-lg border border-hairline p-5 tablet:flex-row tablet:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            void calcular(slug, daysInput);
          }}
        >
          <label className="flex min-w-0 flex-1 flex-col gap-1.5">
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

          <label className="flex flex-col gap-1.5">
            <span className="text-caption-sm font-medium text-muted">Diárias</span>
            <input
              type="number"
              inputMode="numeric"
              min={CALC_MIN_DAYS}
              max={CALC_MAX_DAYS}
              value={daysInput}
              onChange={(e) => setDaysInput(e.target.value)}
              className="h-12 w-28 rounded-sm border border-hairline bg-canvas px-3 text-body-md tabular-nums text-ink focus:border-mp-primary focus:outline-none"
            />
          </label>

          <Button type="submit" disabled={carregando}>
            {carregando ? "Calculando…" : "Calcular"}
          </Button>
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
          <section className="mt-8" aria-live="polite">
            <h2 className="text-display-sm text-ink">
              {durationLabel(result.days)} em {nome}
            </h2>
            {result.priced.length === 0 ? (
              <p className="mt-3 text-body-md text-body">
                Nenhum parceiro cota {durationLabel(result.days)} nesse destino. Veja a tabela
                completa ou busque por data.
              </p>
            ) : (
              <ol className="mt-4 space-y-3">
                {result.priced.map(({ row, cell }, i) => (
                  <li
                    key={row.key}
                    className={cn(
                      "flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-lg border p-4",
                      i === 0 ? "border-mp-primary bg-mp-pale" : "border-hairline",
                    )}
                  >
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <span className="text-title-sm text-ink">
                        {i + 1}. {row.label}
                      </span>
                      <span className="text-caption-sm text-muted">
                        {row.unit.parking_type_name}
                        {formatDistance(row.unit.distance_m) && (
                          <> · {formatDistance(row.unit.distance_m)}</>
                        )}
                        {i === 0 && <> · menor preço</>}
                      </span>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        {cell.oldTotal != null && (
                          <span className="block text-caption-sm text-muted line-through tabular-nums">
                            {formatBRL(cell.oldTotal)}
                          </span>
                        )}
                        <span className="block text-title-md tabular-nums text-ink">
                          {formatBRL(cell.total)}
                        </span>
                        <span className="block text-caption-sm tabular-nums text-muted">
                          {result.days > 1 && cell.perDay != null && (
                            <>{formatBRL(cell.perDay)} por diária</>
                          )}
                          {cell.economyPct != null && (
                            <span className="ml-1 font-medium text-success">
                              {cell.economyPct}% menor online
                            </span>
                          )}
                        </span>
                      </div>
                      <Button asChild>
                        <Link to={listingPath(row.unit)}>Reservar</Link>
                      </Button>
                    </div>
                  </li>
                ))}
              </ol>
            )}

            {result.blocked.length > 0 && (
              <p className="mt-4 text-body-sm text-muted">
                Fora desta conta por estadia mínima:{" "}
                {result.blocked
                  .map(({ row, cell }) => `${row.label} (a partir de ${cell.minStayDays} diárias)`)
                  .join(", ")}
                .
              </p>
            )}
          </section>
        )}

        <section className="mt-12 max-w-[720px]">
          <h2 className="text-display-sm text-ink">Como a calculadora funciona</h2>
          <p className="mt-3 text-body-md text-body">
            O valor de cada vaga sai do motor de preços da Movepark, o mesmo que fecha a reserva
            no checkout: a tabela vigente do parceiro aplicada ao número de diárias que você
            escolheu, sem estimativa.
          </p>
          <p className="mt-3 text-body-md text-body">
            O preço riscado é o balcão, a tarifa de quem chega sem reservar. Para comparar os
            destinos lado a lado, veja o{" "}
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
