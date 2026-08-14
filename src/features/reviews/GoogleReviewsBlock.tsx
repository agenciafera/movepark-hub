import { GoogleLogo } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import type { GooglePlaceSnapshot } from "@/types/domain";
import { isSnapshotFresh } from "./google.logic";
import { RatingStars, RatingSummary } from "./RatingStars";

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
  if (!snapshot) return null;
  if (!isSnapshotFresh(snapshot.fetched_at)) return null;
  if (snapshot.rating == null || snapshot.user_rating_count === 0) return null;

  return (
    <section
      className={cn("space-y-6", className)}
      aria-label={`Avaliações do Google para ${placeName}`}
    >
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

      <ul className="grid grid-cols-1 gap-4 tablet:grid-cols-2">
        {snapshot.reviews.map((r, i) => (
          <li
            key={`${r.authorName}-${i}`}
            className="rounded-md border border-hairline bg-canvas p-4"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-3">
                {r.authorPhotoUri && (
                  <img
                    src={r.authorPhotoUri}
                    alt={r.authorName}
                    loading="lazy"
                    width={32}
                    height={32}
                    referrerPolicy="no-referrer"
                    className="size-8 rounded-full"
                  />
                )}
                {r.authorUri ? (
                  <a
                    href={r.authorUri}
                    target="_blank"
                    rel="noreferrer nofollow"
                    className="text-body-sm font-medium text-ink"
                  >
                    {r.authorName}
                  </a>
                ) : (
                  <span className="text-body-sm font-medium text-ink">{r.authorName}</span>
                )}
              </div>
              <RatingStars value={r.rating} size="sm" />
            </div>
            <p className="text-caption text-muted">{r.relativePublishTimeDescription}</p>
            <p className="mt-2 text-body-sm text-ink">{r.text}</p>
            {r.reviewUri && (
              <a
                href={r.reviewUri}
                target="_blank"
                rel="noreferrer nofollow"
                className="mt-2 inline-block text-caption underline"
              >
                Ver no Google
              </a>
            )}
          </li>
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
