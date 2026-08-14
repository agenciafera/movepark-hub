import * as React from "react";
import { Link } from "react-router-dom";
import { Car, Heart } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { formatBRL } from "@/lib/format";
import { contasDoConsumidorLigadas } from "@/lib/features";
import { RatingBadge } from "@/features/reviews/RatingStars";
import { pickCardBadge } from "@/features/reviews/google.logic";
import { parkingTypeChipClass } from "./parkingTypeStyle";

/**
 * Card de estacionamento COMPARTILHADO entre as três superfícies do consumer: a home
 * ("os mais reservados"), a `/search` e a `/destinos/:slug`. É o único modelo de card
 * de estacionamento do app: mesma estrutura, mesmos tokens de tipografia, espaçamento
 * e botão em todas ("uma marca, três superfícies", DESIGN.md). Cada superfície é só um
 * adaptador que mapeia seus dados pra estas props (ver `ResultCard` e a home).
 *
 * É puramente apresentacional: não busca dado, não conhece rota nem regra de negócio.
 * Quem chama monta o `href`, os selos e o estado de favorito.
 */
export type ParkingCardAmenity = { code?: string; label: string };

type IconType = React.ComponentType<{ className?: string }>;

export type ParkingCardProps = {
  href: string;
  coverImage: string | null;
  coverAlt: string;
  /** Título do card: `Empresa · Unidade`, montado por `parkingTitle` (@/lib/parkingName).
   *  Nunca só a empresa: quem tem várias unidades vira uma fila de cards idênticos. */
  title: string;
  /** Tipo de vaga: a identidade do card ("Vaga Coberta"). Vem em chip colorido. */
  parkingTypeName: string;
  /** Código do `parking_type` (covered/uncovered/valet…) — define a cor do chip. */
  parkingTypeCode?: string;
  /** Linha de metadados em `text-muted`. Muda por superfície: destino na home, unidade
   *  + distância na busca. `metaIcon` é o ícone que a antecede (Airplane, MapPin…). */
  meta?: React.ReactNode;
  metaIcon?: IconType;
  /** Nota agregada. O `RatingBadge` some sozinho quando não há avaliação. */
  rating?: { avg: number | null | undefined; count: number | null | undefined } | null;
  /**
   * Nota do Google. Entra só quando não há avaliação Movepark: em 375px, dois selos viram
   * ruído e nenhuma das notas é lida.
   */
  googleRating?: { avg: number | null; count: number } | null;
  amenities?: ParkingCardAmenity[];
  price: { total: number | null | undefined; oldPrice?: number | null; unit: string };
  /** Selos sobre a imagem, no canto superior esquerdo (diferenciais comparativos). */
  overlay?: React.ReactNode;
  /** Selo no rodapé da imagem, canto inferior esquerdo (escassez/demanda). */
  imageFooter?: React.ReactNode;
  /** Favoritar. Ausente → o card não mostra o coração (mantém a estrutura). */
  favorite?: { isSaved: boolean; onToggle: () => void };
  /** Esgotado: tira o link (card não clicável) e esmaece. */
  soldOut?: boolean;
  className?: string;
  testId?: string;
  typeTestId?: string;
  metaTestId?: string;
  amenitiesTestId?: string;
};

/** Envolve o conteúdo num link, ou num `div` inerte quando esgotado (sem âncora). */
function CardLink({
  to,
  soldOut,
  className,
  children,
}: {
  to: string;
  soldOut: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  if (soldOut) {
    return (
      <div className={className} aria-disabled="true">
        {children}
      </div>
    );
  }
  return (
    <Link to={to} className={className}>
      {children}
    </Link>
  );
}

/**
 * Selo comparativo sobre a imagem (pílula violeta com ícone), reaproveitado por todas
 * as superfícies pra o "Mais barato"/"Mais perto" saírem idênticos onde aparecerem.
 */
export function ParkingCardBadge({ icon: Icon, children }: { icon?: IconType; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-mp-primary px-3 py-1 text-[12px] font-semibold text-white shadow-sm backdrop-blur-sm">
      {Icon && <Icon className="h-3 w-3 shrink-0" />}
      {children}
    </span>
  );
}

export function ParkingCard({
  href,
  coverImage,
  coverAlt,
  title,
  parkingTypeName,
  parkingTypeCode,
  meta,
  metaIcon: MetaIcon,
  rating,
  googleRating,
  amenities,
  price,
  overlay,
  imageFooter,
  favorite,
  soldOut = false,
  className,
  testId,
  typeTestId,
  metaTestId,
  amenitiesTestId,
}: ParkingCardProps) {
  return (
    <article
      data-testid={testId}
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-2xl border border-hairline bg-canvas transition-shadow hover:shadow-tier",
        soldOut && "opacity-60",
        className,
      )}
    >
      {/* Imagem — 4:3 em todas as superfícies. Sem foto → placeholder com o carro. */}
      <CardLink
        to={href}
        soldOut={soldOut}
        className="relative block aspect-[4/3] overflow-hidden bg-surface-soft"
      >
        {coverImage ? (
          <img
            src={coverImage}
            alt={coverAlt}
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
            loading="lazy"
            decoding="async"
          />
        ) : (
          <>
            <div className="absolute inset-0 flex items-center justify-center">
              <Car className="h-14 w-14 text-muted-soft" aria-hidden />
            </div>
            <div className="absolute inset-0 bg-soft-gradient opacity-60" aria-hidden />
          </>
        )}

        {overlay && <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">{overlay}</div>}
        {imageFooter && <div className="absolute bottom-3 left-3">{imageFooter}</div>}
      </CardLink>

      {/* Favorito. O gate mora aqui porque este card é o gargalo do coração:
          busca, home e destino passam todos por ele. */}
      {favorite && contasDoConsumidorLigadas() && (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            favorite.onToggle();
          }}
          className="absolute right-3 top-3 inline-flex h-9 w-9 items-center justify-center rounded-full bg-canvas/95 backdrop-blur transition-transform hover:scale-105"
          aria-label={favorite.isSaved ? "Remover dos salvos" : "Salvar nos favoritos"}
        >
          <Heart
            className={cn(
              "h-4 w-4 transition-colors",
              favorite.isSaved ? "fill-mp-primary stroke-mp-primary" : "text-ink",
            )}
          />
        </button>
      )}

      {/* Conteúdo */}
      <CardLink to={href} soldOut={soldOut} className="flex flex-1 flex-col gap-3 p-5">
        <div className="min-w-0 space-y-0.5">
          {/* Duas linhas: "Empresa · Unidade" não cabe em uma só nos cards de 3 colunas,
              e a parte cortada seria justamente a unidade, que é o que diferencia. */}
          <h3 className="line-clamp-2 text-balance text-[18px] font-bold leading-snug text-ink">
            {title}
          </h3>
          {/* O tipo é a identidade do card: dois cards da mesma unidade só se distinguem por
              aqui. O chip ganha cor por tipo (parkingTypeStyle) pra o cliente diferenciar de
              relance na lista. */}
          <div className="pt-0.5">
            <span
              data-testid={typeTestId}
              className={cn(
                "inline-flex max-w-full items-center truncate rounded-full px-2.5 py-0.5 text-[12px] font-semibold",
                parkingTypeChipClass(parkingTypeCode),
              )}
            >
              {parkingTypeName}
            </span>
          </div>
          {meta && (
            <p
              data-testid={metaTestId}
              className="line-clamp-1 flex items-center gap-1 text-body-sm text-muted"
            >
              {MetaIcon && <MetaIcon className="h-3 w-3 shrink-0 text-mp-primary" />}
              <span>{meta}</span>
            </p>
          )}
          {(() => {
            const badge = pickCardBadge(
              { avg: rating?.avg ?? null, count: rating?.count ?? 0 },
              googleRating ? { rating: googleRating.avg, count: googleRating.count } : null,
            );
            if (!badge) return null;
            return (
              <RatingBadge
                avg={badge.avg}
                count={badge.count}
                className="text-body-sm"
                suffix={badge.source === "google" ? "no Google" : undefined}
              />
            );
          })()}
        </div>

        {/* Amenidades */}
        {amenities && amenities.length > 0 && (
          <div data-testid={amenitiesTestId} className="flex flex-wrap gap-1.5">
            {amenities.map((a) => (
              <span
                key={a.code ?? a.label}
                className="rounded-full bg-surface-strong px-2.5 py-1 text-[12px] font-medium text-ink"
              >
                {a.label}
              </span>
            ))}
          </div>
        )}

        {/* Preço — sempre por último */}
        <div className="mt-auto pt-1">
          {price.oldPrice != null && price.total != null && price.oldPrice > price.total && (
            <div className="text-[13px] text-muted line-through tabular-nums">
              {formatBRL(price.oldPrice)}
            </div>
          )}
          <div className="text-[24px] font-bold leading-none text-ink tabular-nums">
            {formatBRL(price.total)}
          </div>
          <span className="mt-1 block text-body-sm text-muted">{price.unit}</span>
        </div>
      </CardLink>
    </article>
  );
}
