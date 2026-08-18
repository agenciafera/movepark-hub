import * as React from "react";
import { Link, useLoaderData, useSearchParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import {
  ArrowRight,
  ArrowsLeftRight,
  CaretDown,
  Car,
  CheckCircle,
  Database,
  SealCheck,
  ShieldCheck,
  Tag,
  TrendDown,
} from "@phosphor-icons/react";
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
import { breadcrumbSchema } from "@/lib/jsonld";
import { cn } from "@/lib/utils";
import { JOURNEY_COMPARISON } from "@/features/how-it-works/journey";
import {
  getLocationCapabilities,
  type LocationCapabilities,
} from "@/features/listing/capabilities";
import { fetchPriceForDays } from "@/features/price-index/api";
import { agruparPorRegiao } from "@/features/price-index/regioes";
import {
  CALC_MAX_DAYS,
  CALC_MIN_DAYS,
  CALC_QUICK_DAYS,
  calcResults,
  sanitizeDays,
  type CalcResult,
} from "@/features/price-index/calculadora.logic";
import {
  COMBUSTIVEL,
  KM_MAX,
  KM_MIN,
  SURGE_OPCOES,
  TARIFA_APP_PADRAO,
  breakEvenDays,
  comparar,
  reservaWindow,
  sanitizeKm,
} from "@/features/price-index/comparadorApp.logic";
import {
  durationLabel,
  formatDistance,
  listingPath,
  type PriceDestination,
  type PriceIndexData,
} from "@/features/price-index/priceIndex.logic";
import { SITE_URL } from "@/lib/site";

const EYEBROW = "text-badge uppercase tracking-[0.4px] text-mp-indigo";

/** Mesmo recuo do container do `PageHero`, para o cartão nascer alinhado com o h1. */
const CONTAINER = "mx-auto w-full max-w-[1080px] px-4 desktop:px-8";

/** Lote mapeado pela Movepark, ainda sem contrato: aparece sem preço (ADR-010). */
export type CalculadoraProspect = {
  name: string;
  slug: string;
  distance_km: number | null;
};

export type CalculadoraData = {
  data: PriceIndexData;
  /** Todos os destinos publicados, com ou sem parceiro precificado. */
  catalogo: { slug: string; name: string; short_name: string | null; state: string | null }[];
  /** Lotes mapeados por slug de destino, para a lista ficar completa como a do concorrente. */
  prospects: Record<string, CalculadoraProspect[]>;
  generatedAt: string;
};

const DESCRIPTION =
  "Escolha o aeroporto e o número de diárias e veja quanto custa em cada estacionamento, " +
  "do mais barato ao mais caro. Parceiros Movepark reservam online pelo preço do checkout.";

const celulaBase =
  "tablet:table-cell tablet:border-b tablet:border-hairline-soft tablet:px-3 tablet:py-5 tablet:align-top";

/**
 * Faixa de confiança logo abaixo do cartão. São três **fatos** da página, não
 * promessas de transação: cancelamento, vaga garantida e preço travado dependem
 * de a unidade fechar a reserva no Hub (ADR-009), e essa faixa não sabe de qual
 * unidade se trata. Quem promete é o painel, e ele consulta capacidade.
 */
const CONFIANCA = [
  {
    Icone: Database,
    title: "Preço do motor de reservas",
    text: "É o mesmo valor que fecha a reserva no checkout.",
  },
  {
    Icone: SealCheck,
    title: "Estacionamentos verificados",
    text: "Parceiros aprovados e avaliados pela Movepark.",
  },
  {
    Icone: Tag,
    title: "Balcão sempre à vista",
    text: "Cada preço vem com a tarifa de quem chega sem reservar.",
  },
];

/**
 * As linhas não numéricas do comparativo "reserva online contra balcão". A
 * redação é a mesma de `/como-funciona` (`JOURNEY_COMPARISON`), de propósito:
 * repetir texto já revisado é melhor do que escrever uma variação que diverge.
 *
 * Cada uma é promessa de transação e só entra com a capacidade declarada da
 * unidade que o painel está recomendando (ADR-009).
 */
const LINHAS_QUALITATIVAS: { k: string; cap: keyof LocationCapabilities }[] = [
  { k: "Vaga", cap: "guaranteedSpot" },
  { k: "Chegada", cap: "hubCheckout" },
  { k: "Cancelamento", cap: "cancellation" },
];

/** Fim de página: para onde o cliente vai depois de saber o preço. */
const PROXIMOS = [
  {
    title: "Como funciona a reserva",
    sub: "Do clique ao retorno do voo, em 7 passos",
    to: "/como-funciona",
    img: "/illustrations/il-people-reserva-app.webp",
  },
  {
    title: "Comparar todos os destinos",
    sub: "O índice de preços, aeroporto por aeroporto",
    to: "/precos",
    img: "/illustrations/il-destino-aeroporto.webp",
  },
  {
    title: "Falar com o suporte",
    sub: "Preço, traslado, cancelamento e check-in",
    to: "/faq",
    img: "/illustrations/il-people-viajante.webp",
  },
];

/**
 * Metodologia, em pergunta e resposta. Fica em accordion, mas com `forceMount`:
 * a resposta continua no HTML quando o item está fechado, porque crawler de IA
 * não abre accordion.
 */
const METODOLOGIA: { q: string; a: React.ReactNode }[] = [
  {
    q: "De onde vem o preço de cada vaga?",
    a: (
      <>
        Do motor de preços da Movepark, o mesmo que fecha a reserva no checkout: a tabela vigente do
        parceiro aplicada ao número de diárias que você escolheu. Não é estimativa.
      </>
    ),
  },
  {
    q: "O que é o preço riscado?",
    a: (
      <>
        É a tarifa de balcão, o que o estacionamento cobra de quem chega sem reservar. A diferença
        entre os dois é o que você economiza reservando online.
      </>
    ),
  },
  {
    q: "Por que alguns estacionamentos aparecem sem preço?",
    a: (
      <>
        São fichas mapeadas pela nossa equipe, de estacionamentos que ainda não têm contrato com a
        Movepark. A ficha mostra endereço e comodidades, mas o preço é a tabela do local, cobrada na
        hora. Para comparar os destinos lado a lado, veja o{" "}
        <Link
          to="/precos"
          className="font-medium text-mp-indigo underline-offset-2 hover:underline"
        >
          índice de preços
        </Link>
        .
      </>
    ),
  },
  {
    q: "Como vocês calculam o custo do app de transporte?",
    a: (
      <>
        É estimativa: Uber e 99 não oferecem API pública de preço. Usamos a tarifa de referência da
        categoria básica ({formatBRL(TARIFA_APP_PADRAO.bandeirada)} de partida,{" "}
        {formatBRL(TARIFA_APP_PADRAO.porKm)} por km e {formatBRL(TARIFA_APP_PADRAO.porMinuto)} por
        minuto, com mínima de {formatBRL(TARIFA_APP_PADRAO.minima)}), com o tempo estimado a 30 km/h
        na cidade. Fonte:{" "}
        <a
          href={TARIFA_APP_PADRAO.fonteUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-mp-indigo underline-offset-2 hover:underline"
        >
          {TARIFA_APP_PADRAO.fonte}
        </a>
        , {TARIFA_APP_PADRAO.coletadoEm}. Em pico, chuva ou madrugada a tarifa dinâmica sobe o valor
        real: por isso o controle de dinâmica e o campo para colar a corrida que o seu app mostrou.
      </>
    ),
  },
  {
    q: "E o combustível do carro?",
    a: (
      <>
        Quando ativado, usa {COMBUSTIVEL.kmPorLitro} km/L a {formatBRL(COMBUSTIVEL.precoLitro)} o
        litro ({COMBUSTIVEL.fonte}), no trajeto de ida e volta.
      </>
    ),
  },
];

/** Linha de resultado do painel: rótulo, explicação curta e valor. */
function LinhaResultado({
  k,
  hint,
  valor,
  tom = "ink",
}: {
  k: string;
  hint: string;
  valor: string;
  tom?: "ink" | "success" | "muted";
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="text-title-md text-ink">{k}</span>
        <span className="text-pretty text-caption-sm text-muted">{hint}</span>
      </span>
      <span
        className={cn(
          "shrink-0 whitespace-nowrap text-title-md tabular-nums",
          tom === "success" && "text-success",
          tom === "muted" && "text-muted",
          tom === "ink" && "text-ink",
        )}
      >
        {valor}
      </span>
    </div>
  );
}

/**
 * Calculadora de estacionamento (/calculadora-estacionamento-aeroporto):
 * destino + diárias viram o ranking real do motor. O desenho é o do Claude
 * Design (`Calculadora Movepark v2`): abre na faixa navy, o cartão que junta
 * controle e veredito monta sobre a borda dela, e o resto da página é a prova
 * do número que ele deu.
 *
 * Parceiros Movepark vêm primeiro, com Reservar em destaque; lotes mapeados sem
 * contrato ficam numa gaveta à parte, sem preço, com a ficha (ADR-010). As
 * durações da matriz padrão (1/7/15/30) respondem na hora com o dado do build;
 * qualquer outra vai ao motor pela mesma RPC pública. O estado inicial
 * (primeiro destino, 7 diárias) é pré-renderizado.
 */
export default function CalculadoraPage() {
  const loaded = useLoaderData() as CalculadoraData | null;
  const [searchParams] = useSearchParams();

  const destinations = loaded?.data.destinations ?? [];
  const catalogo = loaded?.catalogo ?? [];
  const standardDays = loaded?.data.days ?? [1, 7, 15, 30];

  // O cliente escolhe O QUE comparar: preço de estacionamento (default) ou a
  // conta contra app de transporte. A URL antiga do comparador chega ?modo=app.
  const [modo, setModo] = React.useState<"estacionamento" | "app">(
    searchParams.get("modo") === "app" ? "app" : "estacionamento",
  );

  const [slug, setSlug] = React.useState(catalogo[0]?.slug ?? destinations[0]?.slug ?? "");
  const [daysInput, setDaysInput] = React.useState("7");
  const [result, setResult] = React.useState<CalcResult | null>(() => {
    const inicial = catalogo[0]?.slug ?? destinations[0]?.slug;
    if (!inicial) return null;
    const comPreco = destinations.find((d) => d.slug === inicial);
    return comPreco ? calcResults(comPreco, 7) : { days: 7, priced: [], blocked: [] };
  });
  const [carregando, setCarregando] = React.useState(false);
  const [erro, setErro] = React.useState<string | null>(null);
  // Comparador de app: distância, tarifa dinâmica, corrida real e combustível.
  const [kmInput, setKmInput] = React.useState("25");
  const [surge, setSurge] = React.useState<number>(1);
  const [tarifaManual, setTarifaManual] = React.useState("");
  const [comCombustivel, setComCombustivel] = React.useState(false);
  const [mapeadosAbertos, setMapeadosAbertos] = React.useState(false);
  // O destino nas diárias em vigor (o da matriz padrão ou o buscado no motor).
  const [destinoCalc, setDestinoCalc] = React.useState<PriceDestination | null>(
    destinations.find((d) => d.slug === (catalogo[0]?.slug ?? destinations[0]?.slug)) ?? null,
  );
  // Consultas de duração fora da matriz padrão, para não repetir a ida ao motor.
  const consultasRef = React.useRef(new Map<string, PriceDestination>());
  // Cálculo ao vivo: digitou ou arrastou, calcula sozinho depois de uma pausa curta.
  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  // Escolher destino lá embaixo tem que trazer a pessoa de volta ao resultado.
  const cartaoRef = React.useRef<HTMLDivElement>(null);

  const destino = destinations.find((d) => d.slug === slug) ?? null;
  const destinoMeta = catalogo.find((c) => c.slug === slug) ?? destino;
  const nome = destinoMeta ? (destinoMeta.short_name ?? destinoMeta.name) : "";
  const mapeados = loaded?.prospects[slug] ?? [];

  const calcular = React.useCallback(
    async (destSlug: string, diasBrutos: string) => {
      const dias = sanitizeDays(diasBrutos);
      const dest = destinations.find((d) => d.slug === destSlug) ?? null;
      if (dias == null) {
        setErro(`Informe de ${CALC_MIN_DAYS} a ${CALC_MAX_DAYS} diárias.`);
        return;
      }
      setErro(null);
      // Destino sem parceiro precificado: não há o que consultar no motor; a
      // seção mostra os lotes mapeados (ou o aviso de mapeamento).
      if (!dest) {
        setDestinoCalc(null);
        setResult({ days: dias, priced: [], blocked: [] });
        return;
      }
      if (standardDays.includes(dias)) {
        setDestinoCalc(dest);
        setResult(calcResults(dest, dias));
        return;
      }
      const chave = `${destSlug}:${dias}`;
      const memo = consultasRef.current.get(chave);
      if (memo) {
        setDestinoCalc(memo);
        setResult(calcResults(memo, dias));
        return;
      }
      setCarregando(true);
      try {
        const vivo = await fetchPriceForDays(destSlug, dias);
        if (vivo) {
          consultasRef.current.set(chave, vivo);
          setDestinoCalc(vivo);
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

  const trocarDestino = (novo: string, voltarAoCartao = false) => {
    setSlug(novo);
    setMapeadosAbertos(false);
    void calcular(novo, daysInput);
    if (voltarAoCartao) cartaoRef.current?.scrollIntoView?.({ behavior: "smooth", block: "start" });
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

  // Comparação com app de transporte (mesmo cartão, outro veredito).
  const km = sanitizeKm(kmInput);
  const manualNum = Number.parseFloat(tarifaManual.replace(",", "."));
  const comparacao =
    result && destinoCalc && km != null
      ? comparar(destinoCalc, result.days, km, surge, {
          tarifaManualIda: Number.isFinite(manualNum) && manualNum > 0 ? manualNum : null,
          incluirCombustivel: comCombustivel,
        })
      : null;
  const breakEven =
    destinoCalc && km != null ? breakEvenDays(destinoCalc, km, surge, standardDays) : null;
  const estacionarVence = comparacao?.economia != null && comparacao.economia > 0;
  const carroTotal =
    comparacao?.estacionarTotal != null
      ? comparacao.estacionarTotal + (comparacao.combustivel ?? 0)
      : null;

  // Melhor vaga do destino na duração escolhida: é ela que o painel promete.
  const melhor = result?.priced[0] ?? null;
  const maisCara =
    result && result.priced.length > 1 ? result.priced[result.priced.length - 1] : null;
  const economiaMelhor =
    melhor?.cell.oldTotal != null && melhor.cell.total != null
      ? melhor.cell.oldTotal - melhor.cell.total
      : null;
  // ADR-009: cancelamento, vaga garantida e chegada são promessas de transação.
  // Só aparecem se a unidade que o painel recomenda fecha a reserva no Hub.
  const capacidades = getLocationCapabilities(melhor?.row.unit);
  const dias = result?.days ?? 7;
  const diasSanos = sanitizeDays(daysInput);
  // A barra do ranking mede cada total contra o mais caro da lista.
  const tetoBarra = result?.priced.length
    ? (result.priced[result.priced.length - 1].cell.total ?? 0)
    : 0;
  // Destino só com lote mapeado: a gaveta deixa de ser gaveta.
  const gavetaFixa = (result?.priced.length ?? 0) + (result?.blocked.length ?? 0) === 0;
  const gavetaAberta = gavetaFixa || mapeadosAbertos;
  const grupos = agruparPorRegiao(catalogo);

  const canonical = `${SITE_URL}/calculadora-estacionamento-aeroporto`;
  const titulo = "Calculadora de estacionamento de aeroporto";
  const breadcrumb = breadcrumbSchema([
    { name: "Início", url: SITE_URL },
    { name: "Índice de preços", url: `${SITE_URL}/precos` },
    { name: "Calculadora", url: canonical },
  ]);

  const campo =
    "h-12 w-full rounded-sm border border-hairline bg-canvas px-3 text-body-md text-ink focus:border-mp-primary focus:outline-none";
  const caixaNumero =
    "flex h-11 shrink-0 items-center gap-1 rounded-sm border border-hairline px-3";
  const cartao = "rounded-lg border border-hairline bg-canvas";

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

      {/* O violeta cai num indicador-chave, não em texto decorativo: é a promessa
          da página. Sobre navy ele usa o tom claro, porque o `mp-violet` daria
          2.3:1 e reprovaria. */}
      <PageHero
        className="pb-8 desktop:pb-10"
        breadcrumb={
          <Breadcrumb
            tom="escuro"
            items={[
              { label: "Início", to: "/" },
              { label: "Índice de preços", to: "/precos" },
              { label: "Calculadora" },
            ]}
          />
        }
        title={
          <>
            Saber quanto custa estacionar no aeroporto leva{" "}
            <span className="text-mp-violet-on-navy">10 segundos</span>
          </>
        }
        description="Escolha o destino e as diárias. O preço sai do mesmo motor que fecha a reserva no checkout."
      />

      {/* O cartão monta sobre a borda de baixo da faixa: controle e veredito
          ficam acima da dobra, sem o cliente rolar para saber o preço. */}
      <div className={cn(CONTAINER, "relative z-10 -mt-16 desktop:-mt-20")}>
        <div ref={cartaoRef} className={cn(cartao, "scroll-mt-24 p-5 shadow-tier desktop:p-8")}>
          <div className="grid items-start gap-6 desktop:grid-cols-[minmax(0,1fr)_380px] desktop:gap-10">
            <form
              noValidate
              className="flex min-w-0 flex-col gap-6 desktop:gap-7"
              onSubmit={(e) => {
                e.preventDefault();
                void calcular(slug, daysInput);
              }}
            >
              <fieldset>
                <legend className="sr-only">O que você quer calcular?</legend>
                <div className="flex flex-wrap gap-2.5">
                  {(
                    [
                      { valor: "estacionamento", label: "Preço da vaga", Icone: Car },
                      { valor: "app", label: "Carro ou app?", Icone: ArrowsLeftRight },
                    ] as const
                  ).map((m) => (
                    <label
                      key={m.valor}
                      className={cn(
                        "flex cursor-pointer items-center gap-2 rounded-full border px-4 py-2.5 text-title-sm transition",
                        modo === m.valor
                          ? "border-mp-navy bg-mp-navy text-white"
                          : "border-hairline text-body hover:text-ink",
                      )}
                    >
                      <input
                        type="radio"
                        name="modo"
                        value={m.valor}
                        checked={modo === m.valor}
                        onChange={() => setModo(m.valor)}
                        className="sr-only"
                      />
                      <m.Icone className="h-[18px] w-[18px] shrink-0" aria-hidden />
                      {m.label}
                    </label>
                  ))}
                </div>
              </fieldset>

              <div className="flex flex-col gap-2">
                <label className="flex min-w-0 flex-col gap-2">
                  <span className="text-title-md text-ink">Destino</span>
                  <select
                    value={slug}
                    onChange={(e) => trocarDestino(e.target.value)}
                    className={campo}
                  >
                    {catalogo.map((d) => (
                      <option key={d.slug} value={d.slug}>
                        {d.short_name ?? d.name}
                      </option>
                    ))}
                  </select>
                </label>
                <span className="text-caption-sm text-muted">
                  {result && result.priced.length > 0
                    ? `${result.priced.length} ${
                        result.priced.length === 1 ? "estacionamento" : "estacionamentos"
                      } com reserva online em ${nome}`
                    : `Sem reserva online em ${nome} por enquanto`}
                </span>
              </div>

              <div className="flex min-w-0 flex-col gap-3">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-title-md text-ink" id="rotulo-diarias">
                    Quantas diárias
                  </span>
                  <span className={caixaNumero}>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={CALC_MIN_DAYS}
                      max={CALC_MAX_DAYS}
                      value={daysInput}
                      onChange={(e) => aoMudarDias(e.target.value)}
                      aria-label="Diárias"
                      aria-describedby="rotulo-diarias"
                      className="w-10 bg-transparent text-center text-body-md tabular-nums text-ink focus:outline-none"
                    />
                    <span className="text-body-sm text-muted">
                      {diasSanos === 1 ? "diária" : "diárias"}
                    </span>
                  </span>
                </div>
                <input
                  type="range"
                  min={CALC_MIN_DAYS}
                  max={CALC_MAX_DAYS}
                  value={diasSanos ?? CALC_MIN_DAYS}
                  onChange={(e) => aoMudarDias(e.target.value)}
                  aria-label="Diárias (arraste)"
                  className="w-full min-w-0 accent-mp-primary"
                />
                {/* As pontas dizem só o número: o rótulo e a caixa acima já deram
                    a unidade, e o atalho ao lado repetiria "1 diária". */}
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="text-caption-sm text-muted">1</span>
                  <div className="flex flex-wrap justify-center gap-2" aria-label="Durações comuns">
                    {CALC_QUICK_DAYS.map((d) => (
                      <button
                        key={d}
                        type="button"
                        aria-label={durationLabel(d)}
                        onClick={() => {
                          setDaysInput(String(d));
                          void calcular(slug, String(d));
                        }}
                        className={cn(
                          "rounded-full px-4 py-2 text-body-sm transition",
                          result?.days === d && !carregando
                            ? "bg-mp-navy text-white"
                            : "bg-surface-soft text-body hover:text-ink",
                        )}
                      >
                        {d}d
                      </button>
                    ))}
                  </div>
                  <span className="text-caption-sm text-muted">60</span>
                </div>
              </div>

              {modo === "app" && (
                <>
                  <div className="flex min-w-0 flex-col gap-3 border-t border-hairline pt-6">
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-title-md text-ink" id="rotulo-km">
                        Distância de casa
                      </span>
                      <span className={caixaNumero}>
                        <input
                          type="number"
                          inputMode="numeric"
                          min={KM_MIN}
                          max={KM_MAX}
                          value={kmInput}
                          onChange={(e) => setKmInput(e.target.value)}
                          aria-label="Distância em km"
                          aria-describedby="rotulo-km"
                          className="w-10 bg-transparent text-center text-body-md tabular-nums text-ink focus:outline-none"
                        />
                        <span className="text-body-sm text-muted">km</span>
                      </span>
                    </div>
                    <input
                      type="range"
                      min={KM_MIN}
                      max={KM_MAX}
                      value={km ?? KM_MIN}
                      onChange={(e) => setKmInput(e.target.value)}
                      aria-label="Distância (arraste)"
                      className="w-full min-w-0 accent-mp-primary"
                    />
                    <div className="flex items-center justify-between">
                      <span className="text-caption-sm text-muted">{KM_MIN} km</span>
                      <span className="text-caption-sm text-muted">{KM_MAX} km</span>
                    </div>
                  </div>

                  <div className="flex flex-col gap-3">
                    <span className="text-title-md text-ink" id="rotulo-surge">
                      Tarifa dinâmica do app
                    </span>
                    <div
                      className="flex flex-wrap gap-2"
                      role="group"
                      aria-labelledby="rotulo-surge"
                    >
                      {SURGE_OPCOES.map((s) => (
                        <button
                          key={s}
                          type="button"
                          aria-pressed={surge === s}
                          onClick={() => setSurge(s)}
                          className={cn(
                            "rounded-sm px-4 py-2.5 text-body-sm transition",
                            surge === s
                              ? "border-2 border-mp-navy bg-surface-pale text-ink"
                              : "border border-hairline text-body hover:text-ink",
                          )}
                        >
                          {s === 1 ? "sem dinâmica" : `${String(s).replace(".", ",")}x`}
                        </button>
                      ))}
                    </div>
                    <span className="text-pretty text-caption-sm text-muted">
                      Em pico, chuva ou madrugada o app cobra mais. Ajuste para o que você costuma
                      ver.
                    </span>
                  </div>

                  <label className="flex min-w-0 flex-col gap-2">
                    <span className="text-title-md text-ink">
                      Corrida que o app mostrou (ida, opcional)
                    </span>
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder="R$"
                      value={tarifaManual}
                      onChange={(e) => setTarifaManual(e.target.value)}
                      aria-label="Valor da corrida de ida"
                      className={cn(campo, "tabular-nums")}
                    />
                  </label>

                  <label className="flex cursor-pointer items-start gap-3 rounded-sm border border-hairline p-4">
                    <input
                      type="checkbox"
                      checked={comCombustivel}
                      onChange={(e) => setComCombustivel(e.target.checked)}
                      className="mt-0.5 h-4 w-4 shrink-0 accent-mp-primary"
                    />
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className="text-title-sm text-ink">Somar combustível ao carro</span>
                      <span className="text-caption-sm text-muted">
                        {COMBUSTIVEL.kmPorLitro} km/L a {formatBRL(COMBUSTIVEL.precoLitro)}, ida e
                        volta
                      </span>
                    </span>
                  </label>
                </>
              )}
            </form>

            {/* Painel do veredito. É ele que responde a pergunta do modo. */}
            <div
              className="flex min-w-0 flex-col gap-5 rounded-md bg-surface-pale p-5 desktop:p-6"
              aria-live="polite"
            >
              {modo === "estacionamento" &&
                (melhor && melhor.cell.total != null ? (
                  <>
                    <div className="flex flex-col gap-1">
                      <span className={EYEBROW}>Melhor preço</span>
                      <span className="text-display-3xl tabular-nums text-ink">
                        {carregando ? "…" : formatBRL(melhor.cell.total)}
                      </span>
                      <span className="text-pretty text-body-sm text-body">
                        {melhor.row.label}, {melhor.row.unit.parking_type_name}
                        {formatDistance(melhor.row.unit.distance_m) && (
                          <>, a {formatDistance(melhor.row.unit.distance_m)} do terminal</>
                        )}
                        , {durationLabel(dias)}.
                      </span>
                    </div>

                    <div className="h-px bg-hairline" />

                    <div className="flex flex-col gap-4">
                      {economiaMelhor != null && melhor.cell.oldTotal != null && (
                        <LinhaResultado
                          k="Você economiza"
                          hint={`Contra a tarifa de balcão, de ${formatBRL(melhor.cell.oldTotal)}`}
                          valor={formatBRL(economiaMelhor)}
                          tom="success"
                        />
                      )}
                      {melhor.cell.perDay != null && (
                        <LinhaResultado
                          k="Preço por diária"
                          hint="Já com a reserva online aplicada"
                          valor={formatBRL(melhor.cell.perDay)}
                        />
                      )}
                      {maisCara?.cell.total != null && (
                        <LinhaResultado
                          k="Opção mais cara"
                          hint="O teto da lista, para comparar"
                          valor={formatBRL(maisCara.cell.total)}
                          tom="muted"
                        />
                      )}
                    </div>

                    <div className="h-px bg-hairline" />

                    <div className="flex flex-col gap-3">
                      <Button asChild className="w-full">
                        <Link to={listingPath(melhor.row.unit)}>Reservar essa vaga</Link>
                      </Button>
                      {capacidades.cancellation && (
                        <span className="flex items-center justify-center gap-2 text-caption-sm font-medium text-success">
                          <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden />
                          Cancelamento grátis conforme a tarifa
                        </span>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="flex flex-col gap-3">
                    <span className={EYEBROW}>Sem reserva online</span>
                    <p className="text-pretty text-body-md text-body">
                      {destino
                        ? `Nenhum parceiro cota ${durationLabel(dias)} em ${nome}. Ajuste as diárias ou escolha outro destino.`
                        : `Ainda estamos mapeando os estacionamentos de ${nome}.`}
                    </p>
                    <Button asChild variant="outline" className="w-full">
                      <Link to={destino ? `/precos/${destino.slug}` : `/destinos/${slug}`}>
                        {destino ? "Ver a tabela completa" : "Ver a página do destino"}
                      </Link>
                    </Button>
                  </div>
                ))}

              {modo === "app" &&
                (comparacao && comparacao.economia != null && carroTotal != null ? (
                  <>
                    <div className="flex flex-col gap-1">
                      <span className={EYEBROW}>
                        {estacionarVence
                          ? "Estacionar sai mais barato"
                          : "Ir de app sai mais barato"}
                      </span>
                      <span className="text-display-3xl tabular-nums text-ink">
                        {formatBRL(Math.abs(comparacao.economia))}
                      </span>
                      <span className="text-pretty text-body-sm text-body">
                        {estacionarVence ? (
                          <>
                            De diferença a favor do carro, com a vaga mais barata
                            {comCombustivel ? " e o combustível da ida e volta" : ""}. Você ainda
                            volta no seu próprio carro.
                          </>
                        ) : (
                          <>
                            De diferença a favor do app nessa distância e duração. Aumente as
                            diárias ou confira a tarifa dinâmica do seu horário: a conta vira
                            rápido.
                          </>
                        )}
                      </span>
                    </div>

                    <div className="h-px bg-hairline" />

                    <div className="flex flex-col gap-3">
                      {(
                        [
                          {
                            chave: "carro",
                            Icone: Car,
                            title: "Levar o carro",
                            sub: `${comparacao.estacionarLabel ?? ""}${
                              comCombustivel ? " + combustível" : ""
                            }`,
                            total: carroTotal,
                            vence: estacionarVence,
                          },
                          {
                            chave: "app",
                            Icone: ArrowsLeftRight,
                            title: "Ir de app",
                            sub: comparacao.appManual
                              ? "Ida e volta, no valor que você informou"
                              : `Ida e volta, dinâmica ${String(comparacao.surge).replace(".", ",")}x`,
                            total: comparacao.appTotal,
                            vence: !estacionarVence,
                          },
                        ] as const
                      ).map((linha) => (
                        <div
                          key={linha.chave}
                          className={cn(
                            "flex items-center gap-3 rounded-sm p-4",
                            linha.vence
                              ? "bg-mp-navy text-white"
                              : "border border-hairline bg-canvas text-ink",
                          )}
                        >
                          <span
                            className={cn(
                              "flex h-8 w-8 shrink-0 items-center justify-center rounded-sm",
                              linha.vence ? "bg-white/15 text-white" : "bg-surface-soft text-muted",
                            )}
                            aria-hidden
                          >
                            <linha.Icone className="h-4 w-4" />
                          </span>
                          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                            <span className="text-title-sm">{linha.title}</span>
                            <span
                              className={cn(
                                "truncate text-caption-sm",
                                linha.vence ? "text-white/70" : "text-muted",
                              )}
                            >
                              {linha.sub}
                            </span>
                          </span>
                          <span className="shrink-0 whitespace-nowrap text-display-sm tabular-nums">
                            {formatBRL(linha.total)}
                          </span>
                        </div>
                      ))}
                    </div>

                    {comparacao.melhorUnidade && (
                      <Button asChild className="w-full">
                        <Link
                          to={`${listingPath(comparacao.melhorUnidade)}?${new URLSearchParams(
                            reservaWindow(new Date(), comparacao.days),
                          ).toString()}`}
                        >
                          Reservar a vaga mais barata
                        </Link>
                      </Button>
                    )}

                    <div className="flex flex-col gap-1.5">
                      {breakEven != null && (
                        <span className="text-pretty text-caption-sm text-muted">
                          Nesse trajeto, estacionar sai mais barato a partir de{" "}
                          {durationLabel(breakEven)}. A janela sugerida é entrada amanhã às 22h, e
                          dá para ajustar as datas na página da vaga.
                        </span>
                      )}
                      <span className="text-pretty text-caption-sm text-muted">
                        O lado do app é estimativa. Uber e 99 não publicam tabela oficial.
                      </span>
                    </div>
                  </>
                ) : (
                  <div className="flex flex-col gap-3">
                    <span className={EYEBROW}>Carro ou app?</span>
                    <p className="text-pretty text-body-md text-body">
                      Ainda não há parceiro com reserva online em {nome} para fazer essa conta.
                      Escolha outro destino ao lado.
                    </p>
                  </div>
                ))}
            </div>
          </div>

          {erro && (
            <p className="mt-4 text-body-sm text-mp-red" role="alert">
              {erro}
            </p>
          )}
        </div>
      </div>

      <div className={cn(CONTAINER, "mt-4 grid gap-3 tablet:grid-cols-3")}>
        {CONFIANCA.map((c) => (
          <div key={c.title} className={cn(cartao, "flex items-start gap-3 p-4")}>
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm bg-surface-pale text-mp-indigo"
              aria-hidden
            >
              <c.Icone className="h-[18px] w-[18px]" />
            </span>
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="text-title-sm text-ink">{c.title}</span>
              <span className="text-pretty text-caption-sm text-muted">{c.text}</span>
            </span>
          </div>
        ))}
      </div>

      {/* A lista completa, que é a prova do número do painel. */}
      {modo === "estacionamento" && result && destinoMeta && (
        <section className={cn(CONTAINER, "pt-12 desktop:pt-16")}>
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h2 className="text-balance text-display-2xl text-ink">
              Todas as opções em {nome}, da mais barata
            </h2>
            <p className="text-body-sm text-muted">
              {durationLabel(result.days)} · {result.priced.length} com reserva online
              {mapeados.length > 0 && <> · {mapeados.length} sem contrato ainda</>}
            </p>
          </div>

          {result.priced.length + result.blocked.length === 0 ? (
            mapeados.length === 0 && (
              <p className="mt-4 text-body-md text-body">
                {destino ? (
                  <>
                    Nenhum parceiro cota {durationLabel(result.days)} nesse destino. Veja a{" "}
                    <Link
                      to={`/precos/${destino.slug}`}
                      className="font-medium text-mp-indigo underline-offset-2 hover:underline"
                    >
                      tabela completa
                    </Link>{" "}
                    ou busque por data.
                  </>
                ) : (
                  <>
                    Ainda estamos mapeando os estacionamentos de {nome}. Veja a{" "}
                    <Link
                      to={`/destinos/${slug}`}
                      className="font-medium text-mp-indigo underline-offset-2 hover:underline"
                    >
                      página do destino
                    </Link>
                    .
                  </>
                )}
              </p>
            )
          ) : (
            <div className={cn("mt-4", cartao, "border-0 tablet:overflow-hidden tablet:border")}>
              <table className="block w-full border-collapse tablet:table">
                <caption className="sr-only">
                  Preço de {durationLabel(result.days)} de estacionamento em {nome}
                </caption>
                <thead className="hidden tablet:table-header-group">
                  <tr>
                    <th
                      scope="col"
                      className="border-b border-hairline py-3 pl-5 pr-3 text-left text-caption-sm font-medium text-muted"
                    >
                      Estacionamento
                    </th>
                    <th
                      scope="col"
                      className="w-[200px] border-b border-hairline px-3 py-3 text-left text-caption-sm font-medium text-muted"
                    >
                      R$ por diária
                    </th>
                    <th
                      scope="col"
                      className="border-b border-hairline px-3 py-3 text-left text-caption-sm font-medium text-muted"
                    >
                      Total ({durationLabel(result.days)})
                    </th>
                    <th
                      scope="col"
                      className="border-b border-hairline py-3 pl-3 pr-5 text-right text-caption-sm font-medium text-muted"
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
                        "grid grid-cols-2 gap-x-4 gap-y-3 rounded-md border p-4 tablet:table-row tablet:border-0 tablet:p-0",
                        i === 0
                          ? "border-mp-navy bg-surface-pale tablet:bg-surface-pale"
                          : "border-hairline bg-canvas tablet:bg-transparent",
                      )}
                    >
                      <td
                        className={cn(
                          "order-1 col-span-2",
                          celulaBase,
                          "tablet:py-4 tablet:pl-5 tablet:pr-3",
                        )}
                      >
                        <div className="flex items-start gap-3">
                          <span
                            className={cn(
                              "flex h-8 w-8 shrink-0 items-center justify-center rounded-sm text-caption-sm tabular-nums",
                              i === 0 ? "bg-mp-navy text-white" : "bg-surface-soft text-muted",
                            )}
                          >
                            {String(i + 1).padStart(2, "0")}
                          </span>
                          <span className="flex min-w-0 flex-col gap-0.5">
                            <span className="text-title-md text-ink">
                              {row.label}
                              {i === 0 && (
                                <span className="ml-2 inline-block rounded-full bg-mp-teal px-2 py-0.5 align-middle text-badge uppercase text-mp-navy">
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
                          </span>
                        </div>
                      </td>
                      <td className={cn("order-3", celulaBase, "tablet:py-4")}>
                        <span className="block text-caption-sm text-muted tablet:hidden">
                          R$ por diária
                        </span>
                        {cell.total != null && tetoBarra > 0 && (
                          <span
                            className="mb-1.5 mt-1 block h-1.5 w-full overflow-hidden rounded-full bg-surface-soft tablet:mt-0"
                            aria-hidden
                          >
                            <span
                              className={cn(
                                "block h-full rounded-full",
                                i === 0 ? "bg-mp-navy" : "bg-muted-steel",
                              )}
                              style={{
                                width: `${Math.max(5, Math.round((cell.total / tetoBarra) * 100))}%`,
                              }}
                            />
                          </span>
                        )}
                        <span className="block text-body-sm tabular-nums text-body">
                          {formatBRL(cell.perDay)} / diária
                        </span>
                      </td>
                      <td className={cn("order-4", celulaBase, "tablet:py-4")}>
                        <span className="block text-caption-sm text-muted tablet:hidden">
                          Total ({durationLabel(result.days)})
                        </span>
                        <span className="block text-display-sm tabular-nums text-ink">
                          {formatBRL(cell.total)}
                        </span>
                        {cell.oldTotal != null && (
                          <span className="mt-0.5 flex items-baseline gap-2">
                            <span className="text-caption-sm tabular-nums text-muted line-through">
                              {formatBRL(cell.oldTotal)}
                            </span>
                            {cell.economyPct != null && (
                              <span className="text-caption-sm font-medium text-success">
                                -{cell.economyPct}%
                              </span>
                            )}
                          </span>
                        )}
                      </td>
                      {/* No mobile o botão fecha o card, depois do preço: o
                            cliente decide vendo o número, não antes dele. */}
                      <td
                        className={cn(
                          "order-5 col-span-2 justify-self-stretch",
                          celulaBase,
                          "tablet:py-4 tablet:pl-3 tablet:pr-5 tablet:text-right tablet:align-middle",
                        )}
                      >
                        <Button asChild className="w-full tablet:w-auto">
                          <Link to={listingPath(row.unit)}>Reservar</Link>
                        </Button>
                      </td>
                    </tr>
                  ))}

                  {result.blocked.map(({ row, cell }) => (
                    <tr
                      key={row.key}
                      className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-md border border-hairline bg-canvas p-4 tablet:table-row tablet:border-0 tablet:bg-transparent tablet:p-0"
                    >
                      <td
                        className={cn(
                          "order-1 col-span-2",
                          celulaBase,
                          "tablet:py-4 tablet:pl-5 tablet:pr-3",
                        )}
                      >
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
                      <td
                        className={cn("order-3 col-span-2", celulaBase, "tablet:py-4")}
                        colSpan={2}
                      >
                        <span className="block text-body-sm text-muted">
                          entrada a partir de {cell.minStayDays} diárias
                        </span>
                      </td>
                      <td
                        className={cn(
                          "order-4 col-span-2",
                          celulaBase,
                          "tablet:py-4 tablet:pl-3 tablet:pr-5 tablet:text-right",
                        )}
                      >
                        <span className="block text-caption-sm text-muted">
                          reserve a partir de {cell.minStayDays} diárias
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Lote mapeado sem contrato: gaveta à parte, para não sujar o ranking
              de quem tem preço (ADR-010). Quando o destino não tem nenhum
              parceiro precificado ela deixa de ser gaveta e já abre, senão o
              cliente acha uma página vazia. */}
          {mapeados.length > 0 && (
            <div className={cn("mt-3 overflow-hidden", cartao)}>
              {gavetaFixa ? (
                <div className="flex flex-col gap-0.5 p-5">
                  <span className="text-title-md text-ink">
                    {mapeados.length} sem reserva online
                  </span>
                  <span className="text-pretty text-caption-sm text-muted">
                    Mapeados pela nossa equipe. O preço é a tabela do local.
                  </span>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setMapeadosAbertos((v) => !v)}
                  aria-expanded={mapeadosAbertos}
                  className="flex w-full items-center justify-between gap-3 p-5 text-left"
                >
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="text-title-md text-ink">
                      {mapeados.length} sem reserva online
                    </span>
                    <span className="text-pretty text-caption-sm text-muted">
                      Mapeados pela nossa equipe. O preço é a tabela do local.
                    </span>
                  </span>
                  <CaretDown
                    className={cn(
                      "h-4 w-4 shrink-0 text-muted transition-transform",
                      mapeadosAbertos && "rotate-180",
                    )}
                    aria-hidden
                  />
                </button>
              )}
              {gavetaAberta && (
                <ul className="flex flex-col">
                  {mapeados.map((p) => (
                    <li
                      key={p.slug}
                      className="flex items-center gap-3 border-t border-hairline-soft px-5 py-3.5"
                    >
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="text-pretty text-title-sm text-ink">{p.name}</span>
                        <span className="text-caption-sm text-muted">
                          {p.distance_km != null && (
                            <>{formatDistance(Math.round(p.distance_km * 1000))} · </>
                          )}
                          mapeado pela Movepark
                        </span>
                      </span>
                      <Link
                        to={`/estacionamentos/${slug}/${p.slug}`}
                        className="shrink-0 text-caption-sm font-medium text-mp-indigo underline underline-offset-4"
                      >
                        Ver ficha
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {result.priced.length + result.blocked.length + mapeados.length > 0 && (
            <p className="mt-3 text-pretty text-caption-sm text-muted">
              Preços do motor de reservas Movepark, os mesmos do checkout.{" "}
              <a
                href="#como-funciona"
                className="font-medium text-mp-indigo underline-offset-2 hover:underline"
              >
                Como a calculadora funciona
              </a>
            </p>
          )}

          {!destino && (
            <p className="mt-4 text-body-sm text-body">
              Tem um estacionamento neste destino?{" "}
              <Link
                to="/seja-parceiro"
                className="font-medium text-mp-indigo underline-offset-2 hover:underline"
              >
                Seja parceiro Movepark
              </Link>
            </p>
          )}
        </section>
      )}

      {/* Reservar antes contra chegar no balcão, na vaga que o painel recomendou.
          As duas primeiras linhas são preço; as outras são promessa, e só entram
          com a capacidade declarada da unidade (ADR-009). */}
      {modo === "estacionamento" &&
        melhor?.cell.total != null &&
        melhor.cell.oldTotal != null &&
        economiaMelhor != null && (
          <section className={cn(CONTAINER, "pt-12 desktop:pt-16")}>
            <div className="grid items-start gap-6 desktop:grid-cols-2 desktop:gap-10">
              <div className="flex min-w-0 flex-col items-start gap-3">
                <h2 className="text-balance text-display-2xl text-ink">
                  Quanto você economiza reservando online
                </h2>
                <p className="max-w-[44ch] text-pretty text-body-md text-body">
                  A diferença entre reservar antes e chegar sem reserva na vaga mais barata de{" "}
                  {nome}, em {durationLabel(dias)}.
                </p>
                <span className="flex items-center gap-2 rounded-full bg-success/10 px-4 py-2 text-body-sm font-medium text-success">
                  <TrendDown className="h-4 w-4 shrink-0" aria-hidden />
                  {formatBRL(economiaMelhor)} de economia
                </span>
              </div>

              <div className={cn("min-w-0 overflow-hidden", cartao)}>
                <table className="w-full border-collapse text-left">
                  <caption className="sr-only">
                    Reserva online contra tarifa de balcão em {nome}
                  </caption>
                  <thead>
                    <tr className="bg-surface-soft">
                      <th scope="col" className="w-px whitespace-nowrap px-4 py-3">
                        <span className="sr-only">Item</span>
                      </th>
                      <th scope="col" className={cn("px-4 py-3", EYEBROW)}>
                        Reserva online
                      </th>
                      <th
                        scope="col"
                        className="px-4 py-3 text-badge uppercase tracking-[0.4px] text-muted-steel"
                      >
                        No balcão
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      {
                        k: "Preço por diária",
                        mp: formatBRL(melhor.cell.perDay),
                        other: formatBRL(melhor.cell.oldTotal / dias),
                      },
                      {
                        k: "Total da estadia",
                        mp: formatBRL(melhor.cell.total),
                        other: formatBRL(melhor.cell.oldTotal),
                      },
                      ...LINHAS_QUALITATIVAS.filter((l) => capacidades[l.cap]).flatMap((l) => {
                        const linha = JOURNEY_COMPARISON.find((c) => c.k === l.k);
                        return linha ? [linha] : [];
                      }),
                    ].map((linha) => (
                      <tr key={linha.k} className="border-t border-hairline align-top">
                        <th
                          scope="row"
                          className="whitespace-nowrap px-4 py-3.5 text-left text-caption-sm font-medium text-muted"
                        >
                          {linha.k}
                        </th>
                        <td className="px-4 py-3.5">
                          <span className="flex gap-2">
                            <CheckCircle
                              className="mt-0.5 h-4 w-4 shrink-0 text-success"
                              aria-hidden
                            />
                            <span className="text-pretty text-body-sm font-medium text-ink">
                              {linha.mp}
                            </span>
                          </span>
                        </td>
                        <td className="text-pretty px-4 py-3.5 text-body-sm text-muted">
                          {linha.other}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div
              className={cn(
                "mt-4 flex flex-col gap-4 rounded-lg border border-hairline bg-surface-soft p-5 tablet:flex-row tablet:items-center tablet:justify-between",
              )}
            >
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="text-pretty text-title-md text-ink">
                  Precisa de mais de {CALC_MAX_DAYS} diárias ou de um destino fora da lista?
                </span>
                <span className="text-pretty text-body-sm text-body">
                  Nosso time cota na mão e responde nos dias úteis.
                </span>
              </span>
              <Button asChild variant="secondary" className="shrink-0">
                <Link to="/contato">Falar com o time</Link>
              </Button>
            </div>
          </section>
        )}

      <section className={cn(CONTAINER, "pt-12 desktop:pt-16")}>
        <h2 className="text-balance text-display-2xl text-ink">Aeroportos e destinos atendidos</h2>
        <p className="mt-2 max-w-[52ch] text-pretty text-body-md text-body">
          Toque em um destino para recalcular. São {catalogo.length} lugares com estacionamento
          mapeado pela Movepark.
        </p>
        <div className="mt-5 grid gap-6 tablet:grid-cols-2 tablet:gap-x-8">
          {grupos.map((g) => (
            <div key={g.regiao} className="flex flex-col gap-3">
              <span className="text-badge uppercase tracking-[0.4px] text-muted-steel">
                {g.regiao}
              </span>
              <div className="flex flex-wrap gap-2">
                {g.itens.map((d) => (
                  <button
                    key={d.slug}
                    type="button"
                    aria-pressed={d.slug === slug}
                    onClick={() => trocarDestino(d.slug, true)}
                    className={cn(
                      "rounded-full border px-4 py-2 text-body-sm transition",
                      d.slug === slug
                        ? "border-mp-navy bg-mp-navy text-white"
                        : "border-hairline text-body hover:text-ink",
                    )}
                  >
                    {d.short_name ?? d.name}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className={cn(CONTAINER, "pt-12 desktop:pt-16")}>
        <h2 className="text-balance text-display-2xl text-ink">E agora</h2>
        <div className="mt-4 grid gap-3 tablet:grid-cols-3">
          {PROXIMOS.map((p) => (
            <Link
              key={p.to}
              to={p.to}
              className={cn(cartao, "flex items-center gap-4 p-5 transition hover:shadow-tier")}
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

      <section
        id="como-funciona"
        className={cn(CONTAINER, "scroll-mt-24 pb-16 pt-12 desktop:pb-24 desktop:pt-16")}
      >
        <div className={cn(cartao, "p-5 desktop:p-8")}>
          <h2 className="text-balance text-display-sm text-ink">Como a calculadora funciona</h2>
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
            Preços conferidos no motor de reservas em{" "}
            <time dateTime={loaded.generatedAt}>{formatDate(loaded.generatedAt)}</time>. Uber e 99
            são marcas dos seus respectivos donos; esta página compara custos e não tem relação com
            essas empresas.
          </p>
        </div>
      </section>
    </>
  );
}
