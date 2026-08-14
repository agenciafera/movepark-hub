import { Link, useLoaderData } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/EmptyState";
import { PageHeader } from "@/components/shared/PageHeader";
import { formatBRL, formatDate } from "@/lib/format";
import { breadcrumbSchema, itemListSchema } from "@/lib/jsonld";
import {
  destinationSummary,
  durationLabel,
  overallStats,
  type PriceIndexData,
} from "@/features/price-index/priceIndex.logic";

const SITE_URL = "https://hub.movepark.co";

export type PrecosIndexData = {
  data: PriceIndexData;
  /** Momento do build (ou da navegação) em que o motor foi consultado. */
  generatedAt: string;
};

const DESCRIPTION =
  "Preços de estacionamento em aeroportos e terminais: diária, 7, 15 e 30 dias, " +
  "com preço de balcão e economia online. O valor da tabela é o mesmo do checkout.";

/**
 * Índice de preços (/precos): o retrato do que custa estacionar perto de cada
 * destino, tirado do motor de reservas a cada publicação. Pré-renderizado no
 * build; cada destino tem página própria em /precos/<slug> e gêmeo Markdown.
 */
export default function PrecosPage() {
  const loaded = useLoaderData() as PrecosIndexData | null;

  if (!loaded || loaded.data.destinations.length === 0) {
    return (
      <div className="mx-auto w-full max-w-[1080px] px-4 py-16">
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

  const { data, generatedAt } = loaded;
  const stats = overallStats(data);
  const canonical = `${SITE_URL}/precos`;
  const titulo = "Índice de preços de estacionamento";

  const breadcrumb = breadcrumbSchema([
    { name: "Início", url: SITE_URL },
    { name: "Índice de preços", url: canonical },
  ]);
  const lista = itemListSchema(
    data.destinations.map((d) => ({
      name: `Preços de estacionamento em ${d.short_name ?? d.name}`,
      url: `${SITE_URL}/precos/${d.slug}`,
    })),
  );

  return (
    <>
      <Helmet>
        <title>{`${titulo}: diária, 7, 15 e 30 dias | Movepark`}</title>
        <meta name="description" content={DESCRIPTION} />
        <link rel="canonical" href={canonical} />
        <meta property="og:type" content="website" />
        <meta property="og:title" content={`${titulo} | Movepark`} />
        <meta property="og:description" content={DESCRIPTION} />
        <meta property="og:url" content={canonical} />
        <script type="application/ld+json">{JSON.stringify(breadcrumb)}</script>
        <script type="application/ld+json">{JSON.stringify(lista)}</script>
      </Helmet>

      <div className="mx-auto w-full max-w-[1080px] px-4 py-12">
        <PageHeader
          variant="content"
          size="lg"
          title={titulo}
          description="Quanto custa estacionar perto de cada aeroporto e terminal, no preço real de reserva: diária, 7, 15 e 30 diárias, com o balcão ao lado."
        >
          <p className="text-caption-sm text-muted">
            Conferido no motor de reservas em{" "}
            <time dateTime={generatedAt}>{formatDate(generatedAt)}</time>
          </p>
        </PageHeader>

        {/* O retrato do índice em quatro números, direto do dado. */}
        <dl className="mt-8 grid grid-cols-2 gap-4 tablet:grid-cols-4">
          <div className="rounded-lg border border-hairline p-4">
            <dt className="text-caption-sm text-muted">Destinos com preço</dt>
            <dd className="mt-1 text-display-sm text-ink">{stats.destinationCount}</dd>
          </div>
          <div className="rounded-lg border border-hairline p-4">
            <dt className="text-caption-sm text-muted">Estacionamentos comparados</dt>
            <dd className="mt-1 text-display-sm text-ink">{stats.unitCount}</dd>
          </div>
          <div className="rounded-lg border border-hairline p-4">
            <dt className="text-caption-sm text-muted">Menor diária hoje</dt>
            <dd className="mt-1 text-display-sm tabular-nums text-ink">
              {formatBRL(stats.minDailyFrom)}
            </dd>
          </div>
          <div className="rounded-lg border border-hairline p-4">
            <dt className="text-caption-sm text-muted">Economia sobre o balcão</dt>
            <dd className="mt-1 text-display-sm text-ink">
              {stats.maxEconomyPct != null ? `até ${stats.maxEconomyPct}%` : "varia"}
            </dd>
          </div>
        </dl>

        <section className="mt-12">
          <h2 className="text-display-sm text-ink">Preços por destino</h2>
          <div className="mt-4 grid gap-4 tablet:grid-cols-2">
            {data.destinations.map((dest) => {
              const s = destinationSummary(dest, data.days);
              return (
                <Link
                  key={dest.slug}
                  to={`/precos/${dest.slug}`}
                  className="group flex flex-col gap-3 rounded-lg border border-hairline p-5 transition hover:border-mp-primary"
                >
                  <div>
                    <h3 className="text-title-md text-ink">{dest.short_name ?? dest.name}</h3>
                    <p className="text-caption-sm text-muted">
                      {[dest.city, dest.state].filter(Boolean).join("/")}
                      {" · "}
                      {s.unitCount === 1
                        ? "1 estacionamento parceiro"
                        : `${s.unitCount} estacionamentos parceiros`}
                    </p>
                  </div>
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-1">
                    {s.byDuration.map((b) => (
                      <div key={b.days} className="flex items-baseline justify-between gap-2">
                        <dt className="text-caption-sm text-muted">{durationLabel(b.days)}</dt>
                        <dd className="text-body-sm font-medium tabular-nums text-ink">
                          {formatBRL(b.from)}
                        </dd>
                      </div>
                    ))}
                  </dl>
                  <span className="text-body-sm font-medium text-mp-primary">
                    Ver tabela completa
                  </span>
                </Link>
              );
            })}
          </div>
        </section>

        <section className="mt-12 max-w-[720px]">
          <h2 className="text-display-sm text-ink">De onde vêm estes preços</h2>
          <p className="mt-3 text-body-md text-body">
            Do motor de preços da Movepark, o mesmo que calcula sua reserva. O valor que aparece
            aqui é o cobrado no checkout e muda junto com a tabela de cada parceiro, com a data da
            última atualização à vista.
          </p>
          <p className="mt-3 text-body-md text-body">
            Nada fica sob consulta: se o estacionamento está na tabela, dá para reservar por
            aquele valor. O preço riscado é o balcão, a tarifa de quem chega sem reserva. Quando
            reservar online sai mais barato, a economia aparece na própria célula.
          </p>
          <p className="mt-3 text-body-md text-body">
            Alguns estacionamentos só aceitam entrada a partir de 2 ou 3 diárias. Nesses casos a
            tabela mostra a regra no lugar do preço, em vez de esconder a linha.
          </p>
        </section>

        <div className="mt-10">
          <Button asChild>
            <Link to="/search">Buscar estacionamento por data</Link>
          </Button>
        </div>
      </div>
    </>
  );
}
