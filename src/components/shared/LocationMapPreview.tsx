import * as React from "react";
import { loadGoogleMapsNamespace } from "./GooglePlacesAutocomplete";

/**
 * Mini mapa que confirma o ponto capturado (lat/lng), read-only. Reaproveita o
 * bootstrap do Maps que o autocomplete já carrega, então não puxa script novo.
 * Não renderiza nada sem coordenadas ou sem key: é preview, não editor.
 */
export function LocationMapPreview({
  latitude,
  longitude,
}: {
  latitude: number | null;
  longitude: number | null;
}) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  // Guardamos o mapa e o marcador entre renders para só recentralizar, sem
  // remontar o mapa a cada mudança de coordenada.
  const mapRef = React.useRef<unknown>(null);
  const markerRef = React.useRef<unknown>(null);

  React.useEffect(() => {
    if (latitude == null || longitude == null) return;
    let cancelled = false;
    const center = { lat: latitude, lng: longitude };

    loadGoogleMapsNamespace().then(async (maps) => {
      const importLibrary = maps?.importLibrary;
      if (cancelled || !importLibrary || !containerRef.current) return;
      const { Map } = (await importLibrary("maps")) as {
        Map: new (el: HTMLElement, opts: Record<string, unknown>) => unknown;
      };
      const { Marker } = (await importLibrary("marker")) as {
        Marker: new (opts: Record<string, unknown>) => unknown;
      };
      if (cancelled || !containerRef.current) return;

      if (!mapRef.current) {
        mapRef.current = new Map(containerRef.current, {
          center,
          zoom: 16,
          disableDefaultUI: true,
          zoomControl: true,
          gestureHandling: "cooperative",
          clickableIcons: false,
        });
        markerRef.current = new Marker({ map: mapRef.current, position: center });
      } else {
        (mapRef.current as { setCenter: (c: unknown) => void }).setCenter(center);
        (markerRef.current as { setPosition: (c: unknown) => void }).setPosition(center);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [latitude, longitude]);

  if (latitude == null || longitude == null) return null;

  return (
    <div
      ref={containerRef}
      className="h-48 w-full overflow-hidden rounded-md border border-hairline bg-surface-soft"
      role="img"
      aria-label="Mapa da localização da unidade"
    />
  );
}
