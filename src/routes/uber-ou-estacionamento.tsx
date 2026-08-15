import * as React from "react";
import { Link, useLoaderData } from "react-router-dom";
import { Helmet } from "react-helmet-async";
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
  sanitizeDays,
} from "@/features/price-index/calculadora.logic";
import {
  COMBUSTIVEL,
  KM_MAX,
  KM_MIN,
  SURGE_OPCOES,
  TARIFA_APP_PADRAO,
  breakEvenDays,
  comparar,
  sanitizeKm,
  type Comparacao,
} from "@/features/price-index/comparadorApp.logic";
import {
  durationLabel,
  type PriceDestination,
  type PriceIndexData,
} from "@/features/price-index/priceIndex.logic";

const SITE_URL = "https://hub.movepark.co";

export type ComparadorAppData = {
  data: PriceIndexData;
  generatedAt: string;
};

const DESCRIPTION =
  "Ir e voltar de Uber ou 99, ou ir de carro e estacionar perto do aeroporto? Compare as duas " +
  "contas: o estacionamento com preço real de reserva, o app com estimativa aberta.";

/**
 * Comparador de app de transporte contra carro + estacionamento
 * (/uber-ou-estacionamento-aeroporto). O lado do estacionamento é o motor de
 * reservas (dado vivo); o lado do app é estimativa declarada (Uber e 99 não têm
 * API de preço para terceiros), com tarifa dinâmica e valor manual para o
 * usuário aproximar da realidade. O estado inicial (primeiro destino, 7 diárias,
 * 25 km) é pré-renderizado com o veredito no HTML.
 */
export default function UberOuEstacionamentoPage() {
  const loaded = useLoaderData() as ComparadorAppData | null;

  const destinations = loaded?.data.destinations ?? [];
  const standardDays = loaded?.data.days ?? [1, 7, 15, 30];

  const [slug, setSlug] = React.useState(destinations[0]?.slug ?? "");
  const [daysInput, setDaysInput] = React.useState("7");
  const [kmInput, setKmInput] = React.useState("25");
  const [surge, setSurge] = React.useState<number>(1);
  const [tarifaManual, setTarifaManual] = React.useState("");
  const [comCombustivel, setComCombustivel] = React.useState(false);
  const [dias, setDias] = React.useState(7);
  const [destinoCalc, setDestinoCalc] = React.useState<PriceDestination | null>(
    destinations[0] ?? null,
  );
  const [carregando, setCarregando] = React.useState(false);
  const [erro, setErro] = React.useState<string | null>(null);
  const consultasRef = React.useRef(new Map<string, PriceDestination>());
  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Garante o destino certo para a duração pedida (motor para duração fora da matriz). */
  const preparar = React.useCallback(
    async (destSlug: string, diasBrutos: string) => {
      const d = sanitizeDays(diasBrutos);
      const base = destinations.find((x) => x.slug === destSlug) ?? null;
      if (!base) return;
      if (d == null) {
        setErro(`Informe de ${CALC_MIN_DAYS} a ${CALC_MAX_DAYS} diárias.`);
        return;
      }
      setErro(null);
      setDias(d);
      if (standardDays.includes(d)) {
        setDestinoCalc(base);
        return;
      }
      const chave = `${destSlug}:${d}`;
      const memo = consultasRef.current.get(chave);
      if (memo) {
        setDestinoCalc(memo);
        return;
      }
      setCarregando(true);
      try {
        const vivo = await fetchPriceForDays(destSlug, d);
        if (vivo) {
          consultasRef.current.set(chave, vivo);
          setDestinoCalc(vivo);
        }
      } catch {
        setErro("A consulta falhou. Tente de novo em instantes.");
      } finally {
        setCarregando(false);
      }
    },
    [destinations, standardDays],
  );

  const aoMudarDias = (valor: string) => {
    setDaysInput(valor);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => void preparar(slug, valor), 400);
  };

  if (!loaded || destinations.length === 0) {
    return (
      <div className="mx-auto w-full max-w-[1080px] px-4 py-16">
        <EmptyState
          title="Comparador indisponível"
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

  const km = sanitizeKm(kmInput);
  const manual = Number.parseFloat(tarifaManual.replace(",", "."));
  const comparacao: Comparacao | null =
    destinoCalc && km != null
      ? comparar(destinoCalc, dias, km, surge, {
          tarifaManualIda: Number.isFinite(manual) && manual > 0 ? manual : null,
          incluirCombustivel: comCombustivel,
        })
      : null;
  const breakEven =
    destinoCalc && km != null ? breakEvenDays(destinoCalc, km, surge, standardDays) : null;
  const nome = destinoCalc ? (destinoCalc.short_name ?? destinoCalc.name) : "";
  const estacionarVence = comparacao?.economia != null && comparacao.economia > 0;

  const canonical = `${SITE_URL}/uber-ou-estacionamento-aeroporto`;
  const titulo = "Uber ou estacionamento no aeroporto: o que sai mais barato?";
  const breadcrumb = breadcrumbSchema([
    { name: "Início", url: SITE_URL },
    { name: "Índice de preços", url: `${SITE_URL}/precos` },
    { name: "De app ou de carro", url: canonical },
  ]);

  return (
    <>
      <Helmet>
        <title>{`${titulo} | Movepark`}</title>
        <meta name="description" content={DESCRIPTION} />
        <link rel="canonical" href={canonical} />
        <meta property="og:type" content="website" />
        <meta property="og:title" content={`${titulo} | Movepark`} />
        <meta property="og:description" content={DESCRIPTION} />
        <meta property="og:url" content={canonical} />
        <script type="application/ld+json">{JSON.stringify(breadcrumb)}</script>
      </Helmet>

      <div className="mx-auto w-full max-w-[1280px] px-4 py-12">
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
              De app ou de carro
            </li>
          </ol>
        </nav>

        <PageHeader
          variant="content"
          eyebrow="Índice de preços"
          title="De app ou de carro para o aeroporto?"
          description="Duas corridas de ida e volta contra o carro estacionado perto do terminal. O estacionamento entra com preço real de reserva; o app, com estimativa aberta que você pode ajustar."
        >
          <p className="text-caption-sm text-muted">
            Preços de estacionamento conferidos no motor de reservas em{" "}
            <time dateTime={loaded.generatedAt}>{formatDate(loaded.generatedAt)}</time>
          </p>
        </PageHeader>

        <div className="mt-8 grid items-start gap-8 desktop:grid-cols-[300px_minmax(0,1fr)]">
          <aside className="desktop:sticky desktop:top-24">
            <form
              noValidate
              className="rounded-lg border border-hairline p-5"
              onSubmit={(e) => {
                e.preventDefault();
                void preparar(slug, daysInput);
              }}
            >
              <div className="flex flex-col gap-5">
                <label className="flex min-w-0 flex-col gap-1.5">
                  <span className="text-caption-sm font-medium text-muted">Destino</span>
                  <select
                    value={slug}
                    onChange={(e) => {
                      setSlug(e.target.value);
                      void preparar(e.target.value, daysInput);
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
                  <span className="text-caption-sm font-medium text-muted" id="rotulo-dias-comp">
                    Diárias (1 a 60)
                  </span>
                  <div className="flex h-12 items-center gap-3">
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
                      aria-describedby="rotulo-dias-comp"
                      className="h-12 w-20 shrink-0 rounded-sm border border-hairline bg-canvas px-3 text-center text-body-md tabular-nums text-ink focus:border-mp-primary focus:outline-none"
                    />
                  </div>
                  <div className="mt-1 flex flex-wrap gap-2" aria-label="Durações comuns">
                    {CALC_QUICK_DAYS.map((d) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => {
                          setDaysInput(String(d));
                          void preparar(slug, String(d));
                        }}
                        className={cn(
                          "rounded-full border px-3 py-1.5 text-body-sm transition",
                          dias === d && !carregando
                            ? "border-mp-primary text-mp-primary"
                            : "border-hairline text-ink hover:border-mp-primary hover:text-mp-primary",
                        )}
                      >
                        {durationLabel(d)}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex min-w-0 flex-col gap-1.5">
                  <span className="text-caption-sm font-medium text-muted" id="rotulo-km">
                    Distância até o aeroporto (km)
                  </span>
                  <div className="flex h-12 items-center gap-3">
                    <input
                      type="range"
                      min={KM_MIN}
                      max={KM_MAX}
                      value={km ?? KM_MIN}
                      onChange={(e) => setKmInput(e.target.value)}
                      aria-label="Distância (arraste)"
                      className="w-full min-w-0 accent-mp-primary"
                    />
                    <input
                      type="number"
                      inputMode="numeric"
                      min={KM_MIN}
                      max={KM_MAX}
                      value={kmInput}
                      onChange={(e) => setKmInput(e.target.value)}
                      aria-label="Distância em km"
                      aria-describedby="rotulo-km"
                      className="h-12 w-20 shrink-0 rounded-sm border border-hairline bg-canvas px-3 text-center text-body-md tabular-nums text-ink focus:border-mp-primary focus:outline-none"
                    />
                  </div>
                </div>

                <label className="flex min-w-0 flex-col gap-1.5">
                  <span className="text-caption-sm font-medium text-muted">Tarifa dinâmica</span>
                  <select
                    value={String(surge)}
                    onChange={(e) => setSurge(Number(e.target.value))}
                    className="h-12 w-full rounded-sm border border-hairline bg-canvas px-3 text-body-md text-ink focus:border-mp-primary focus:outline-none"
                  >
                    {SURGE_OPCOES.map((s) => (
                      <option key={s} value={s}>
                        {s === 1 ? "sem dinâmica (1x)" : `${String(s).replace(".", ",")}x`}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="flex min-w-0 flex-col gap-1.5">
                  <span className="text-caption-sm font-medium text-muted">
                    Corrida que o app mostrou (ida, opcional)
                  </span>
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="R$"
                    value={tarifaManual}
                    onChange={(e) => setTarifaManual(e.target.value)}
                    aria-label="Valor da corrida de ida"
                    className="h-12 w-full rounded-sm border border-hairline bg-canvas px-3 text-body-md tabular-nums text-ink focus:border-mp-primary focus:outline-none"
                  />
                </label>

                <label className="flex items-center gap-2.5 text-body-sm text-body">
                  <input
                    type="checkbox"
                    checked={comCombustivel}
                    onChange={(e) => setComCombustivel(e.target.checked)}
                    className="h-4 w-4 accent-mp-primary"
                  />
                  Somar combustível no lado do carro
                </label>
              </div>
            </form>

            {erro && (
              <p className="mt-3 text-body-sm text-mp-red" role="alert">
                {erro}
              </p>
            )}
          </aside>

          <div className="min-w-0">
            {comparacao && destinoCalc && (
              <section aria-live="polite">
                <h2 className="text-display-sm text-ink">
                  {durationLabel(comparacao.days)} em {nome}, morando a {comparacao.km} km
                </h2>

                <div className="mt-4 grid gap-4 tablet:grid-cols-2">
                  <div
                    className={cn(
                      "rounded-lg border p-5",
                      !estacionarVence && comparacao.economia != null
                        ? "border-mp-primary bg-mp-pale/60"
                        : "border-hairline",
                    )}
                  >
                    <h3 className="text-title-md text-ink">De app, ida e volta</h3>
                    <p className="mt-2 text-display-sm tabular-nums text-ink">
                      {formatBRL(comparacao.appTotal)}
                    </p>
                    <p className="mt-1 text-caption-sm text-muted">
                      {comparacao.appManual
                        ? "2 corridas no valor que você informou"
                        : `2 corridas estimadas de ${formatBRL(comparacao.appTotal / 2)}${
                            comparacao.surge > 1
                              ? ` com dinâmica ${String(comparacao.surge).replace(".", ",")}x`
                              : ""
                          }`}
                    </p>
                  </div>

                  <div
                    className={cn(
                      "rounded-lg border p-5",
                      estacionarVence ? "border-mp-primary bg-mp-pale/60" : "border-hairline",
                    )}
                  >
                    <h3 className="text-title-md text-ink">De carro, estacionando</h3>
                    <p className="mt-2 text-display-sm tabular-nums text-ink">
                      {comparacao.estacionarTotal != null
                        ? formatBRL(comparacao.estacionarTotal + (comparacao.combustivel ?? 0))
                        : "sem preço nessa duração"}
                    </p>
                    {comparacao.estacionarLabel && (
                      <p className="mt-1 text-caption-sm text-muted">
                        {comparacao.estacionarLabel}
                        {comparacao.combustivel != null && (
                          <> + combustível {formatBRL(comparacao.combustivel)}</>
                        )}
                        {" · "}Parceiro Movepark
                      </p>
                    )}
                  </div>
                </div>

                {comparacao.economia != null && (
                  <p className="mt-5 text-body-md text-body">
                    {estacionarVence ? (
                      <>
                        Estacionando, você economiza{" "}
                        <strong className="font-semibold text-ink">
                          {formatBRL(comparacao.economia)}
                        </strong>{" "}
                        nessa viagem, e volta no seu próprio carro.
                      </>
                    ) : (
                      <>
                        Nessa distância e duração, o app sai{" "}
                        <strong className="font-semibold text-ink">
                          {formatBRL(Math.abs(comparacao.economia))}
                        </strong>{" "}
                        mais barato. Aumente as diárias ou confira a tarifa dinâmica do seu
                        horário: a conta vira rápido.
                      </>
                    )}
                  </p>
                )}

                {breakEven != null && (
                  <p className="mt-2 text-body-sm text-muted">
                    Nesse trajeto, estacionar sai mais barato a partir de{" "}
                    {durationLabel(breakEven)}.
                  </p>
                )}

                <div className="mt-6 flex flex-wrap items-center gap-4">
                  <Link
                    to={`/precos/${destinoCalc.slug}`}
                    className="text-body-sm font-medium text-mp-indigo underline underline-offset-4"
                  >
                    Ver a tabela de preços de {nome}
                  </Link>
                  <Link
                    to="/calculadora-estacionamento-aeroporto"
                    className="text-body-sm font-medium text-mp-indigo underline underline-offset-4"
                  >
                    Calculadora de estacionamento
                  </Link>
                </div>
              </section>
            )}

            <section id="metodologia" className="mt-12 max-w-[720px] scroll-mt-24">
              <h2 className="text-display-sm text-ink">Como esta conta é feita</h2>
              <p className="mt-3 text-body-md text-body">
                O lado do estacionamento é o menor preço de parceiro para a duração escolhida,
                direto do motor de reservas da Movepark, o mesmo que fecha a reserva no checkout.
              </p>
              <p className="mt-3 text-body-md text-body">
                O lado do app é estimativa: Uber e 99 não oferecem API pública de preço. Usamos a
                tarifa de referência da categoria básica ({formatBRL(TARIFA_APP_PADRAO.bandeirada)}{" "}
                de partida + {formatBRL(TARIFA_APP_PADRAO.porKm)} por km +{" "}
                {formatBRL(TARIFA_APP_PADRAO.porMinuto)} por minuto, mínima de{" "}
                {formatBRL(TARIFA_APP_PADRAO.minima)}), com o tempo estimado a 30 km/h na cidade.
                Fonte:{" "}
                <a
                  href={TARIFA_APP_PADRAO.fonteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-mp-indigo underline underline-offset-4"
                >
                  {TARIFA_APP_PADRAO.fonte}
                </a>
                , {TARIFA_APP_PADRAO.coletadoEm}. Em pico, chuva ou madrugada a tarifa dinâmica
                sobe o valor real: por isso o controle de dinâmica e o campo para colar a corrida
                que o seu app mostrou.
              </p>
              <p className="mt-3 text-body-md text-body">
                O combustível opcional usa {COMBUSTIVEL.kmPorLitro} km/L a{" "}
                {formatBRL(COMBUSTIVEL.precoLitro)} o litro ({COMBUSTIVEL.fonte}). Uber e 99 são
                marcas dos seus respectivos donos; esta página compara custos e não tem relação
                com essas empresas.
              </p>
            </section>
          </div>
        </div>
      </div>
    </>
  );
}
