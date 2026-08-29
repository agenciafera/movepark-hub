import * as React from "react";
import { Link, useLoaderData } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { MapPin } from "@phosphor-icons/react";
import type {
  Destination,
  GooglePlaceSnapshot,
  ProspectCard as ProspectCardData,
} from "@/types/domain";
import { GoogleMapEmbed } from "@/components/shared/GoogleMapEmbed";
import { GoogleReviewsBlock } from "@/features/reviews/GoogleReviewsBlock";
import { Button } from "@/components/ui/button";
import type { FaqCombinedItem } from "@/features/faqs/api";
import { FaqList } from "@/features/faqs/FaqList";
import { tituloLoteMapeado } from "@/features/destinations/loteMapeado.logic";
import { breadcrumbSchema, faqSchema, parkingFacilitySchema } from "@/lib/jsonld";
import { formatDistance } from "@/lib/format";
import { trackEvent } from "@/lib/analytics";
import { SITE_URL } from "@/lib/site";
import { caminhoDestino, caminhoFicha } from "@/lib/urls";

export type EstacionamentoMapeadoLoaderData = {
  destination: Destination;
  prospect: ProspectCardData;
  /** Só escopo `destination` (fato do aeroporto). A global fica fora: fala de
   *  reserva pela Movepark, que esta página não oferece. */
  faqs?: FaqCombinedItem[] | null;
  /** Espelho do Google (§6 de avaliacoes-google.md). Nulo enquanto o refresh não passou
   *  naquele place_id, ou quando o hub_admin desligou o bloco daquele lote. */
  google?: GooglePlaceSnapshot | null;
} | null;

/**
 * Página do lote MAPEADO (E0.17-e · ADR-010).
 *
 * Com o ADR-010 esta página fica quase trivial, e isso é o resultado do desenho: **não
 * existe caminho de reserva para esconder, porque não existe dado de reserva.** Não há
 * preço, tipo de vaga, capacidade nem `checkout_mode` na entidade que alimenta esta tela.
 *
 * O que é proibido aqui, e cada proibição tem um custo real por trás:
 *
 * - **Botão de reserva, seletor de data, widget de WhatsApp de reserva.** Hoje, no
 *   WordPress, a página do não-parceiro tem um "Olá! Gostaria de fazer uma reserva?"
 *   flutuando sobre um lote onde reserva não existe. O cliente pede, ninguém entrega:
 *   é CDC art. 30/31 e é pogo-stick puro na SERP.
 * - **Link para o site ou o motor de reserva do lote.** No dia em que ele abre o
 *   Analytics e vê referral da Movepark, já está recebendo de graça exatamente o que
 *   íamos cobrar 20%. A venda morre ali.
 * - **Telefone.** Q-021: guardado, nunca exibido. Nem na tela, nem no JSON-LD.
 * - **FAQ da unidade.** `faq.location_id` aponta para `location` e não existe para lote
 *   mapeado. É por desenho, não é falta. O que a página mostra é o FAQ do AEROPORTO
 *   (escopo `destination`): traslado, segurança e gabarito são fato do destino, valem
 *   aqui e não prometem transação nenhuma deste lote.
 *
 * O produto desta página não é a reserva, é **prova de demanda**: em 60 dias dá para
 * chegar no dono com "sua página teve N visitas e M pessoas pediram para reservar aqui, e
 * você converteu zero porque não está listado".
 */
export default function EstacionamentoMapeadoPage() {
  const data = useLoaderData() as EstacionamentoMapeadoLoaderData;
  const [demandSent, setDemandSent] = React.useState(false);

  if (!data) return null;

  const { destination, prospect } = data;
  // O slug público é o que entra na URL; o antigo segue no banco como histórico.
  const destinoSlug = (destination.public_slug ?? destination.slug) as string;
  const faqItems = data.faqs ?? [];
  const destinationLabel = destination.short_name ?? destination.name;
  // Os dois slugs públicos, nunca os internos: o par antigo responde 301 pra cá, e
  // canonical apontando pra URL que redireciona é loop que derruba a indexação.
  const canonical = `${SITE_URL}${caminhoFicha(destinoSlug, prospect.public_slug ?? prospect.slug)}`;
  const distancia = prospect.distance_km == null ? null : formatDistance(prospect.distance_km);

  const title = tituloLoteMapeado(prospect.name, destination.city);
  const description = distancia
    ? `${prospect.name} fica a ${distancia} do ${destinationLabel}, em ${destination.city}. Este estacionamento ainda não tem reserva online pela Movepark.`
    : `${prospect.name}, em ${destination.city}. Este estacionamento ainda não tem reserva online pela Movepark.`;

  return (
    <>
      <Helmet>
        <title>{title}</title>
        <meta name="description" content={description} />
        <link rel="canonical" href={canonical} />
        <meta property="og:type" content="website" />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
        <meta property="og:url" content={canonical} />
        <script type="application/ld+json">
          {JSON.stringify(
            parkingFacilitySchema({
              name: prospect.name,
              url: canonical,
              latitude: prospect.latitude,
              longitude: prospect.longitude,
              address: prospect.address,
              city: destination.city,
              state: destination.state,
              country: destination.country,
              description: prospect.description,
              amenities: prospect.amenities,
            }),
          )}
        </script>
        <script type="application/ld+json">
          {JSON.stringify(
            breadcrumbSchema([
              { name: "Início", url: SITE_URL },
              { name: "Destinos", url: `${SITE_URL}/estacionamentos` },
              { name: destinationLabel, url: `${SITE_URL}${caminhoDestino(destinoSlug)}` },
              { name: prospect.name, url: canonical },
            ]),
          )}
        </script>
        {/* Um único FAQPage, idêntico ao visível (ADR-002): só o FAQ do aeroporto. */}
        {faqItems.length > 0 && (
          <script type="application/ld+json">
            {JSON.stringify(
              faqSchema(faqItems.map((f) => ({ question: f.question, answer: f.answer }))),
            )}
          </script>
        )}
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
              <Link to={caminhoDestino(destinoSlug)} className="hover:text-ink">
                {destinationLabel}
              </Link>
            </li>
            <li aria-hidden className="text-muted-steel">
              ›
            </li>
            <li aria-current="page" className="text-ink">
              {prospect.name}
            </li>
          </ol>
        </nav>

        <header className="flex flex-col gap-3">
          <h1 className="text-balance text-display-xl text-ink">{prospect.name}</h1>
          {/* Selo em texto, não tooltip: é a frase que explica ao leitor (e ao crawler)
              por que esta página não tem preço nem botão. */}
          <p>
            <span className="inline-flex rounded-full border border-hairline px-2.5 py-1 text-badge text-muted">
              Sem reserva online
            </span>
          </p>
          <p className="text-pretty text-body-md text-muted">
            Mapeamos este estacionamento perto do {destinationLabel}. Ainda não dá para reservar
            pela Movepark.
          </p>
        </header>

        <section className="mt-8 flex flex-col gap-2">
          {prospect.address && (
            <p className="flex items-start gap-1.5 text-body-md text-body">
              <MapPin aria-hidden className="mt-0.5 h-5 w-5 shrink-0 text-muted" />
              {prospect.address}
            </p>
          )}
          {distancia && (
            <p className="text-body-md text-body">
              {distancia} do {prospect.reference_name ?? destinationLabel}
            </p>
          )}
          {/* Preço declarado como ausente, e não omitido: quem chega da busca precisa saber
              que a falta de preço é da oferta, não da página. */}
          <p className="text-body-md text-muted">
            Preço: não informado. Este estacionamento ainda não publica tarifas na Movepark.
          </p>
        </section>

        {prospect.description && (
          <section className="mt-8">
            <p className="text-pretty text-body-md text-body">{prospect.description}</p>
          </section>
        )}

        <section className="mt-8">
          <h2 className="mb-3 text-display-md text-ink">Onde fica</h2>
          <GoogleMapEmbed
            title={`Mapa de ${prospect.name}`}
            target={{ latitude: prospect.latitude, longitude: prospect.longitude }}
            zoom={15}
            className="h-72 w-full rounded-md border border-hairline"
          />
        </section>

        {/* Avaliações do Google: a única prova social que este lote pode ter, porque nota
            Movepark exige `booking` e aqui não existe reserva. Vem rotulada e atribuída,
            nunca somada a nada, e NÃO entra no JSON-LD acima: `aggregateRating` no schema
            afirmaria ao Google, em nome da Movepark, uma nota que é dele (§6 da spec).
            Fica antes do pedido de demanda de propósito: prova social pesa mais lida antes
            do CTA do que depois. */}
        <GoogleReviewsBlock
          snapshot={data.google ?? null}
          placeName={prospect.name}
          className="mt-10"
        />

        {/* CTA primário: prova de demanda.
            Não pede e-mail nem telefone de propósito. A spec define este sinal como
            instrumentação, não mecanismo ("grava evento, não tabela nova"), e pedir
            contato para descartar seria coletar PII sem finalidade nem guarda. Quando o
            volume justificar uma tabela, o campo entra junto com ela. */}
        <section className="mt-10 rounded-lg bg-mp-pale p-6">
          {demandSent ? (
            <p className="text-body-md text-ink" role="status">
              Recebemos seu pedido. Quanto mais gente pede, mais rápido procuramos este
              estacionamento.
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              <h2 className="text-balance text-display-md text-ink">
                Quer reservar neste estacionamento?
              </h2>
              <p className="text-body-md text-body">
                Registre seu interesse. É por onde a gente decide qual estacionamento procurar
                primeiro.
              </p>
              <div>
                <Button
                  onClick={() => {
                    trackEvent("prospect_demand_signal", {
                      prospect_slug: prospect.slug,
                      destination_slug: destination.slug,
                    });
                    setDemandSent(true);
                  }}
                >
                  Quero reservar aqui, me avise quando abrir
                </Button>
              </div>
            </div>
          )}
        </section>

        {/* CTA secundário: reivindicação. Bloco próprio, com botão, como a spec pede.
            Enquanto o fluxo verificado do E0.17-g não existe, o botão leva ao cadastro de
            parceiro, que é um caminho real. O que ele não pode ser é um beco. */}
        <section className="mt-6 rounded-lg border border-hairline p-6">
          <h2 className="text-balance text-display-md text-ink">
            É o administrador deste estacionamento?
          </h2>
          <p className="mt-2 text-body-md text-body">
            Se o estacionamento é seu, a Movepark lista com reserva online e repassa o que for
            vendido.
          </p>
          <div className="mt-4">
            <Button asChild variant="outline">
              {/* O `?lote=` leva a referência para o cadastro: preenche o que a Places API
                  já resolveu e liga o lead à ficha, que é o que permite carimbar a
                  procedência quando a unidade nascer. Não é prova de titularidade, e o
                  processo de aprovação segue igual. */}
              <Link
                to={`/seja-parceiro?lote=${prospect.id}`}
                onClick={() =>
                  trackEvent("prospect_claim_intent", {
                    prospect_slug: prospect.slug,
                    destination_slug: destination.slug,
                  })
                }
              >
                Reivindicar esta página
              </Link>
            </Button>
          </div>
        </section>

        {/* FAQ do AEROPORTO (escopo destination): fato do destino, sem promessa
            de transação deste lote. Cada pergunta linka a própria página. */}
        {faqItems.length > 0 && (
          <section className="mt-10">
            <h2 className="mb-4 text-display-md text-ink">
              Perguntas frequentes sobre estacionar perto do {destinationLabel}
            </h2>
            <FaqList items={faqItems} />
          </section>
        )}

        <div className="mt-10">
          <Link
            to={caminhoDestino(destinoSlug)}
            className="text-body-sm font-medium text-mp-primary underline"
          >
            Ver estacionamentos com reserva no {destinationLabel} →
          </Link>
        </div>
      </article>
    </>
  );
}
