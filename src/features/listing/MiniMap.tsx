import { ExternalLink, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";

type Props = {
  address: string | null;
  latitude: number | null;
  longitude: number | null;
};

/**
 * Placeholder de mapa pro MVP. Substitui pelo MapLibre real na fase pós-MVP.
 * Mostra endereço + botão "Ver no Google Maps".
 */
export function MiniMap({ address, latitude, longitude }: Props) {
  const mapsHref = latitude != null && longitude != null
    ? `https://www.google.com/maps?q=${latitude},${longitude}`
    : address
      ? `https://www.google.com/maps?q=${encodeURIComponent(address)}`
      : "https://www.google.com/maps";

  return (
    <div className="space-y-3">
      <p className="text-body-md text-ink">
        {address ?? "Endereço não cadastrado ainda."}
      </p>

      <div className="relative flex h-56 items-center justify-center overflow-hidden rounded-md border border-hairline bg-soft-gradient">
        <div className="absolute inset-0 opacity-30">
          <svg className="h-full w-full" viewBox="0 0 400 200" xmlns="http://www.w3.org/2000/svg">
            <g stroke="#818FAF" strokeWidth="1" fill="none">
              <path d="M0 60 L400 60" />
              <path d="M0 110 L400 110" />
              <path d="M0 160 L400 160" />
              <path d="M80 0 L80 200" />
              <path d="M200 0 L200 200" />
              <path d="M320 0 L320 200" />
            </g>
          </svg>
        </div>
        <div className="relative flex flex-col items-center gap-2">
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-mp-primary text-white shadow-tier">
            <MapPin className="h-6 w-6" />
          </span>
          <span className="rounded-full bg-canvas px-3 py-1 text-caption text-muted shadow-tier">
            Mapa em breve
          </span>
        </div>
      </div>

      <Button variant="secondary" size="sm" asChild>
        <a href={mapsHref} target="_blank" rel="noreferrer">
          <ExternalLink className="h-4 w-4" />
          Ver no Google Maps
        </a>
      </Button>
    </div>
  );
}
