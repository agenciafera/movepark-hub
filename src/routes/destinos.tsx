import { Link, useLoaderData } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { MapPin } from "@/lib/icons";
import { useDestinations, type Destination } from "@/features/search/api";
import { EmptyState } from "@/components/shared/EmptyState";
import { breadcrumbSchema, itemListSchema } from "@/lib/jsonld";

const SITE_URL = "https://hub.movepark.co";

const TITLE = "Destinos atendidos | Estacionamento perto de aeroportos | Movepark";
const DESCRIPTION =
  "Conheça os aeroportos e destinos atendidos pela Movepark. Reserve estacionamento com antecedência, compare preços e garanta sua vaga perto do seu embarque.";

/** Card de um destino na grade do índice. */
function DestinoCard({ d }: { d: Destination }) {
  return (
    <Link
      to={`/destinos/${d.slug}`}
      className="group flex flex-col gap-1 rounded-md border border-hairline p-4 transition-colors hover:border-mp-primary hover:bg-surface-soft"
    >
      <span className="flex items-center gap-2 text-title-sm text-ink">
        <MapPin className="h-4 w-4 text-mp-primary" />
        {d.short_name ?? d.name}
      </span>
      <span className="text-body-sm text-muted">
        {d.city}
        {d.state ? ` · ${d.state}` : ""}
      </span>
    </Link>
  );
}

export default function DestinosPage() {
  // No SSG/loader os destinos já vêm prontos; no client o hook cobre a navegação.
  const loaderData = useLoaderData() as Destination[] | null;
  const query = useDestinations();
  const destinations = loaderData ?? query.data ?? [];

  const popular = destinations.filter((d) => d.is_popular);
  const others = destinations.filter((d) => !d.is_popular);
  const canonical = `${SITE_URL}/destinos`;

  const listItems = destinations.map((d) => ({
    name: d.name,
    url: `${SITE_URL}/destinos/${d.slug}`,
  }));

  return (
    <>
      <Helmet>
        <title>{TITLE}</title>
        <meta name="description" content={DESCRIPTION} />
        <link rel="canonical" href={canonical} />
        <meta property="og:title" content={TITLE} />
        <meta property="og:description" content={DESCRIPTION} />
        <meta property="og:url" content={canonical} />
        <script type="application/ld+json">
          {JSON.stringify(
            breadcrumbSchema([
              { name: "Início", url: SITE_URL },
              { name: "Destinos", url: canonical },
            ]),
          )}
        </script>
        {listItems.length > 0 && (
          <script type="application/ld+json">{JSON.stringify(itemListSchema(listItems))}</script>
        )}
      </Helmet>

      <div className="mx-auto w-full max-w-5xl px-4 py-8 tablet:py-12">
        <header className="flex flex-col gap-3">
          <span className="text-[11px] font-bold uppercase tracking-[0.4px] text-muted-steel">
            Onde a Movepark atua
          </span>
          <h1 className="text-display-xl text-ink">Destinos atendidos pela Movepark</h1>
          <p className="max-w-3xl text-body-md text-muted">
            Encontre estacionamento perto dos principais aeroportos e destinos do Brasil. Escolha um
            destino para ver as opções de estacionamento, comparar preços e reservar com antecedência.
          </p>
        </header>

        {destinations.length === 0 ? (
          <div className="mt-10">
            <EmptyState
              icon={<MapPin className="h-10 w-10" />}
              title="Nenhum destino publicado ainda."
              description="Em breve listaremos aqui os aeroportos e destinos atendidos."
            />
          </div>
        ) : (
          <>
            {popular.length > 0 && (
              <section className="mt-10">
                <h2 className="mb-4 text-display-md text-ink">Mais buscados</h2>
                <div className="grid grid-cols-1 gap-4 tablet:grid-cols-2 desktop:grid-cols-3">
                  {popular.map((d) => (
                    <DestinoCard key={d.id} d={d} />
                  ))}
                </div>
              </section>
            )}

            {others.length > 0 && (
              <section className="mt-10">
                <h2 className="mb-4 text-display-md text-ink">Outros destinos</h2>
                <div className="grid grid-cols-1 gap-4 tablet:grid-cols-2 desktop:grid-cols-3">
                  {others.map((d) => (
                    <DestinoCard key={d.id} d={d} />
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </>
  );
}
