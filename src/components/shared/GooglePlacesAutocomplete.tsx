import * as React from "react";
import { Input } from "@/components/ui/input";

/**
 * Autocomplete de endereço (Google Places) que deriva geo, usado no onboarding do parceiro
 * (E1.9, spec partner-onboarding-redesign.md §7). A key mora em `VITE_GOOGLE_MAPS_API_KEY` e é
 * **plugável depois**: sem key, o componente degrada para um input de endereço comum (a UI do wizard
 * oferece lat/lng manuais como fallback). A key do Maps é pública por design (restringir por HTTP
 * referrer no Google Cloud). Nada de secret trafega aqui.
 *
 * Usa a **Places API (New)** via `PlaceAutocompleteElement` (web component). A antiga
 * `places.Autocomplete` foi descontinuada para projetos novos (mar/2025) e não retorna resultados
 * neles, então migramos para o elemento recomendado. Ver:
 * https://developers.google.com/maps/documentation/javascript/places-migration-overview
 */

export type PlaceSelection = {
  address: string;
  latitude: number;
  longitude: number;
};

// Shim mínimo da superfície do Places (New) que usamos (evita dependência de @types/google.maps).
type GLatLng = { lat: () => number; lng: () => number };
type GPlace = {
  formattedAddress?: string | null;
  displayName?: string | null;
  location?: GLatLng | null;
  fetchFields: (opts: { fields: string[] }) => Promise<unknown>;
};
type GPlacePrediction = { toPlace: () => GPlace };
type GSelectEvent = Event & { placePrediction?: GPlacePrediction };
type GPlaceAutocompleteElement = HTMLElement & {
  addEventListener: (event: string, handler: (ev: GSelectEvent) => void) => void;
};
type GPlacesNamespace = {
  PlaceAutocompleteElement: new (opts?: Record<string, unknown>) => GPlaceAutocompleteElement;
};
type GMapsNamespace = {
  places?: GPlacesNamespace;
  importLibrary?: (name: string) => Promise<unknown>;
};
type GMaps = { maps?: GMapsNamespace };

const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;

let bootstrapPromise: Promise<boolean> | null = null;

/** Injeta o bootstrap do Maps uma única vez. Resolve `true` quando `google.maps.importLibrary` existe. */
function loadBootstrap(): Promise<boolean> {
  if (typeof window === "undefined" || !apiKey) return Promise.resolve(false);
  const w = window as unknown as { google?: GMaps };
  if (w.google?.maps?.importLibrary) return Promise.resolve(true);
  if (bootstrapPromise) return bootstrapPromise;

  bootstrapPromise = new Promise((resolve) => {
    const isReady = () =>
      Boolean((window as unknown as { google?: GMaps }).google?.maps?.importLibrary);
    const script = document.createElement("script");
    script.src =
      `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}` +
      `&loading=async&language=pt-BR&region=BR`;
    script.async = true;
    // Com `loading=async`, o `onload` do script pode disparar ANTES de `google.maps.importLibrary`
    // existir (a API termina de subir de forma assíncrona). Então esperamos (poll curto) a API expor
    // `importLibrary` antes de resolver, senão `loadPlaces` desistia e o autocomplete não montava.
    script.onload = () => {
      const start = Date.now();
      const check = () => {
        if (isReady()) return resolve(true);
        if (Date.now() - start > 10000) return resolve(false);
        window.setTimeout(check, 50);
      };
      check();
    };
    script.onerror = () => {
      bootstrapPromise = null; // permite retry numa próxima montagem
      resolve(false);
    };
    document.head.appendChild(script);
  });
  return bootstrapPromise;
}

let placesPromise: Promise<GMapsNamespace | null> | null = null;

/**
 * Carrega o Maps e a biblioteca `places` via `importLibrary` (client-only). Diferente de esperar só
 * o `onload` do script, o `importLibrary("places")` garante que `google.maps.places` está pronto
 * antes de resolver. O resultado é **memoizado**: o double-invoke do StrictMode (e vários montes)
 * compartilham a MESMA promise, evitando corridas em que a segunda chamada via `importLibrary`
 * indisponível e retornava null. Resolve `null` se não houver key/window ou se falhar (e nesse
 * caso zera o cache pra permitir retry).
 */
function loadPlaces(): Promise<GMapsNamespace | null> {
  if (placesPromise) return placesPromise;
  placesPromise = (async () => {
    const ok = await loadBootstrap();
    if (!ok) return null;
    const maps = (window as unknown as { google?: GMaps }).google?.maps;
    if (!maps?.importLibrary) return null;
    await maps.importLibrary("places");
    return maps.places ? maps : null;
  })().then((maps) => {
    if (!maps) placesPromise = null; // falhou: permite retry numa próxima montagem
    return maps;
  });
  return placesPromise;
}

/** Exposto para a UI decidir se mostra o fallback manual de lat/lng. */
export const isGooglePlacesEnabled = Boolean(apiKey);

/**
 * Reaproveita o mesmo bootstrap do Maps (memoizado) para OUTRAS libs além de
 * places, como "maps"/"marker" do preview. Resolve o namespace com
 * `importLibrary` pronto, ou `null` se não houver key/window ou falhar.
 */
export async function loadGoogleMapsNamespace(): Promise<GMapsNamespace | null> {
  const ok = await loadBootstrap();
  if (!ok) return null;
  const maps = (window as unknown as { google?: GMaps }).google?.maps;
  return maps?.importLibrary ? maps : null;
}

type Props = {
  id?: string;
  value: string;
  onChange: (address: string) => void;
  onSelect: (place: PlaceSelection) => void;
  placeholder?: string;
  disabled?: boolean;
};

export function GooglePlacesAutocomplete({
  id,
  value,
  onChange,
  onSelect,
  placeholder,
  disabled,
}: Props) {
  // Sem key: degrada para input comum controlado (o wizard oferece lat/lng manuais).
  if (!isGooglePlacesEnabled) {
    return (
      <Input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? "Digite o endereço do estacionamento"}
        disabled={disabled}
        autoComplete="off"
      />
    );
  }

  return (
    <PlacesElement id={id} onSelect={onSelect} placeholder={placeholder} disabled={disabled} />
  );
}

type PlacesElementProps = {
  id?: string;
  onSelect: (place: PlaceSelection) => void;
  placeholder?: string;
  disabled?: boolean;
};

/**
 * Monta o `PlaceAutocompleteElement` (Places API New) imperativamente dentro de um container. O
 * render devolve só um `<div>` estável (nunca lança), e o elemento é criado no effect após a lib
 * carregar. Sob o double-invoke do StrictMode, o primeiro ciclo é cancelado antes do append
 * assíncrono (o promise resolve depois do cleanup), então só o segundo ciclo insere o elemento.
 */
function PlacesElement({ id, onSelect, placeholder }: PlacesElementProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const onSelectRef = React.useRef(onSelect);
  onSelectRef.current = onSelect;

  React.useEffect(() => {
    let cancelled = false;
    let el: GPlaceAutocompleteElement | null = null;

    async function handleSelect(ev: GSelectEvent) {
      const prediction = ev.placePrediction;
      if (!prediction) return;
      const place = prediction.toPlace();
      await place.fetchFields({ fields: ["formattedAddress", "location", "displayName"] });
      const address = place.formattedAddress ?? place.displayName ?? "";
      const loc = place.location;
      if (loc) {
        onSelectRef.current({ address, latitude: loc.lat(), longitude: loc.lng() });
      }
    }

    loadPlaces().then((maps) => {
      const container = containerRef.current;
      if (cancelled || !maps?.places || !container) return;
      el = new maps.places.PlaceAutocompleteElement({ includedRegionCodes: ["br"] });
      if (id) el.id = id;
      if (placeholder) el.setAttribute("placeholder", placeholder);
      el.className = "mp-places-autocomplete";
      el.addEventListener("gmp-select", (ev) => void handleSelect(ev));
      container.replaceChildren(el);
    });

    return () => {
      cancelled = true;
      el?.remove();
    };
  }, [id, placeholder]);

  return <div ref={containerRef} className="w-full" />;
}
