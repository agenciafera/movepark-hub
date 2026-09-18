import * as React from "react";
import { CaretLeft, CaretRight, GoogleLogo } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import type { GooglePlaceSnapshot, GoogleReviewItem } from "@/types/domain";
import { isLongReviewText, isSnapshotFresh } from "./google.logic";
import { RatingStars, RatingSummary } from "./RatingStars";

/** Respiro entre os cards da trilha, em px. Tem que casar com o `gap-4` da lista. */
const GAP = 16;

/**
 * Uma avaliação do Google, creditada.
 *
 * O texto longo entra recolhido em 6 linhas, com o "Ler mais" do lado. O recorte é só de CSS:
 * a avaliação inteira está no HTML do SSG, então crawler e leitor de tela recebem tudo, e o
 * clique não busca nada. É o que mantém "texto sai como veio" de pé num bloco de altura fixa.
 */
function GoogleReviewCard({ review }: { review: GoogleReviewItem }) {
  const isLong = isLongReviewText(review.text);
  const [expanded, setExpanded] = React.useState(false);

  return (
    <li
      className={cn(
        "flex w-[88%] shrink-0 snap-start flex-col rounded-md border border-hairline bg-canvas p-4",
        // Dois por vez a partir do tablet: é o que cabe sem afinar a linha de texto. No celular
        // o card para em 88% para o seguinte aparecer na borda, que é o que anuncia o arrasto.
        "tablet:w-[calc(50%-0.5rem)]",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          {review.authorPhotoUri && (
            <img
              src={review.authorPhotoUri}
              alt={review.authorName}
              loading="lazy"
              width={32}
              height={32}
              referrerPolicy="no-referrer"
              className="size-8 rounded-full"
            />
          )}
          {review.authorUri ? (
            <a
              href={review.authorUri}
              target="_blank"
              rel="noreferrer nofollow"
              className="text-body-sm font-medium text-ink"
            >
              {review.authorName}
            </a>
          ) : (
            <span className="text-body-sm font-medium text-ink">{review.authorName}</span>
          )}
        </div>
        <RatingStars value={review.rating} size="sm" />
      </div>
      <p className="text-caption text-muted">{review.relativePublishTimeDescription}</p>
      <p className={cn("mt-2 text-body-sm text-ink", isLong && !expanded && "line-clamp-6")}>
        {review.text}
      </p>
      {isLong && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="mt-1 self-start text-caption font-medium text-ink underline"
        >
          {expanded ? "Ler menos" : "Ler mais"}
        </button>
      )}
      {review.reviewUri && (
        <a
          href={review.reviewUri}
          target="_blank"
          rel="noreferrer nofollow"
          className="mt-auto pt-3 text-caption underline"
        >
          Ver no Google
        </a>
      )}
    </li>
  );
}

/**
 * Avaliações do Google, exibidas como prova social de terceiro.
 *
 * A atribuição não é enfeite, é condição de uso: marca do Google junto da nota, link para o
 * perfil no Maps, e cada avaliação com nome do autor, foto e link para a avaliação original.
 * O texto sai como veio, sem editar, sem cortar e sem traduzir.
 *
 * Não existe moderação por avaliação individual. O liga e desliga é por unidade e é do
 * hub_admin. Esconder a nota 1 e manter as cinco estrelas não seria exibir o Google, seria
 * fabricar prova social com o nome dele.
 *
 * As cinco avaliações andam numa trilha horizontal, e não numa grade: empilhadas, elas
 * respondiam por metade do scroll da ficha, e a página tem FAQ e reserva depois delas. A
 * trilha é `overflow-x-auto` com `snap`, igual ao resto do consumidor, porque é o arrasto e a
 * inércia do sistema sem uma linha de JS, e porque todas as cinco continuam no HTML do SSG.
 */
export function GoogleReviewsBlock({
  snapshot,
  placeName,
  className,
}: {
  snapshot: GooglePlaceSnapshot | null;
  placeName: string;
  /** Espaçamento de quem chama. Vive aqui, e não num wrapper, porque o bloco some sozinho
   *  em três casos: sem snapshot, vencido e sem nota. Wrapper com margem deixaria um vão. */
  className?: string;
}) {
  const trackRef = React.useRef<HTMLUListElement>(null);
  const [canScrollPrev, setCanScrollPrev] = React.useState(false);
  const [canScrollNext, setCanScrollNext] = React.useState(true);

  const reviews = snapshot?.reviews ?? [];

  function updateArrows() {
    const el = trackRef.current;
    if (!el) return;
    setCanScrollPrev(el.scrollLeft > 8);
    setCanScrollNext(el.scrollLeft + el.clientWidth < el.scrollWidth - 8);
  }

  React.useEffect(() => {
    updateArrows();
  }, [reviews.length]);

  /** Anda um card por vez, porque o passo aqui é uma avaliação para ler, não uma distância. */
  function scroll(dir: "prev" | "next") {
    const el = trackRef.current;
    if (!el) return;
    const card = el.querySelector("li");
    const step = (card?.clientWidth ?? el.clientWidth) + GAP;
    el.scrollBy({ left: dir === "next" ? step : -step, behavior: "smooth" });
  }

  if (!snapshot) return null;
  if (!isSnapshotFresh(snapshot.fetched_at)) return null;
  if (snapshot.rating == null || snapshot.user_rating_count === 0) return null;

  return (
    <section
      className={cn("space-y-6", className)}
      aria-label={`Avaliações do Google para ${placeName}`}
    >
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <GoogleLogo weight="bold" className="h-5 w-5 text-muted" aria-hidden="true" />
            <h2 className="text-display-sm text-ink">Avaliações no Google</h2>
          </div>
          {/* A nota é o número que mais se confunde com a nota da Movepark (ReviewsBlock, na
              mesma página). "no Google" fica em texto visível ao lado da nota, não só no
              heading ou no ícone (que some do HTML pré-renderizado por ser aria-hidden). */}
          <div className="flex flex-wrap items-center gap-2">
            <RatingSummary avg={snapshot.rating} count={snapshot.user_rating_count} />
            <span className="text-body-sm text-muted">no Google</span>
          </div>
        </div>

        {/* Setas: no desktop nenhum gesto anuncia que a lista continua, e quem só olha não
            sabe. Somem com uma avaliação só, que é trilha sem para onde andar. */}
        {reviews.length > 1 && (
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={() => scroll("prev")}
              disabled={!canScrollPrev}
              aria-label="Avaliação anterior"
              className={cn(
                "flex h-9 w-9 items-center justify-center rounded-full border border-hairline bg-canvas transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mp-primary focus-visible:ring-offset-2",
                canScrollPrev ? "hover:bg-surface-soft" : "opacity-30",
              )}
            >
              <CaretLeft className="h-4 w-4 text-ink" weight="bold" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => scroll("next")}
              disabled={!canScrollNext}
              aria-label="Próxima avaliação"
              className={cn(
                "flex h-9 w-9 items-center justify-center rounded-full border border-hairline bg-canvas transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mp-primary focus-visible:ring-offset-2",
                canScrollNext ? "hover:bg-surface-soft" : "opacity-30",
              )}
            >
              <CaretRight className="h-4 w-4 text-ink" weight="bold" aria-hidden="true" />
            </button>
          </div>
        )}
      </div>

      <ul
        ref={trackRef}
        onScroll={updateArrows}
        className="flex touch-pan-x snap-x snap-mandatory gap-4 overflow-x-auto overscroll-x-contain scroll-smooth pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {reviews.map((r, i) => (
          <GoogleReviewCard key={`${r.authorName}-${i}`} review={r} />
        ))}
      </ul>

      {snapshot.maps_uri && (
        <a
          href={snapshot.maps_uri}
          target="_blank"
          rel="noreferrer nofollow"
          className="text-body-sm underline"
        >
          Ver todas as avaliações no Google
        </a>
      )}
    </section>
  );
}
