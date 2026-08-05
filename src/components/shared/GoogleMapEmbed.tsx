import { MapPin } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { MapEmbed } from "./MapEmbed";
import {
  buildGoogleMapEmbedSrc,
  type MapEmbedTarget,
} from "./googleMapEmbed.logic";

/**
 * Mapa do Google embutido (Maps Embed API), usado nas páginas públicas: destino e detalhe da
 * unidade. Substituiu o iframe do OpenStreetMap e o placeholder desenhado à mão.
 *
 * Degrada sem drama: sem key (`VITE_GOOGLE_MAPS_API_KEY`, o caso da suíte E2E) ou sem endereço
 * plotável, mostra um bloco neutro no lugar do iframe. O layout não pula e a página não promete
 * um mapa que não vai chegar. Quem quiser o mapa usa o link externo que fica ao lado.
 */
export function GoogleMapEmbed({
  target,
  title,
  zoom,
  className,
}: {
  target: MapEmbedTarget;
  /** Vira o `title` do iframe: é o que o leitor de tela anuncia. */
  title: string;
  zoom?: number;
  className?: string;
}) {
  const src = buildGoogleMapEmbedSrc(target, {
    apiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined,
    zoom,
  });

  if (!src) {
    return (
      <div
        className={cn(
          "flex items-center justify-center rounded-md border border-hairline bg-surface-soft",
          className,
        )}
        role="img"
        aria-label={title}
      >
        <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-mp-primary text-white shadow-tier">
          <MapPin className="h-6 w-6" />
        </span>
      </div>
    );
  }

  return <MapEmbed title={title} src={src} className={className} />;
}
