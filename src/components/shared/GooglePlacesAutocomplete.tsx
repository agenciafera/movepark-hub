import * as React from "react";
import { Input } from "@/components/ui/input";

/**
 * Autocomplete de endereço (Google Places) que deriva geo, usado no onboarding do parceiro
 * (E1.9, spec partner-onboarding-redesign.md §7). A key mora em `VITE_GOOGLE_MAPS_API_KEY` e é
 * **plugável depois**: sem key, o componente degrada para um input de endereço comum (a UI do wizard
 * oferece lat/lng manuais como fallback). A key do Maps é pública por design (restringir por HTTP
 * referrer no Google Cloud). Nada de secret trafega aqui.
 */

export type PlaceSelection = {
  address: string;
  latitude: number;
  longitude: number;
};

// Shim mínimo da superfície do Google Places que usamos (evita dependência de @types/google.maps).
type GAutocomplete = {
  addListener: (event: string, handler: () => void) => void;
  getPlace: () => {
    formatted_address?: string;
    name?: string;
    geometry?: { location?: { lat: () => number; lng: () => number } };
  };
};
type GMaps = {
  maps?: {
    places?: {
      Autocomplete: new (
        input: HTMLInputElement,
        opts?: Record<string, unknown>,
      ) => GAutocomplete;
    };
  };
};

const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;

let scriptPromise: Promise<GMaps["maps"] | null> | null = null;

/** Carrega o script do Maps uma única vez (client-only). Resolve `null` se não houver key/window. */
function loadPlaces(): Promise<GMaps["maps"] | null> {
  if (typeof window === "undefined" || !apiKey) return Promise.resolve(null);
  const w = window as unknown as { google?: GMaps };
  if (w.google?.maps?.places) return Promise.resolve(w.google.maps);
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise((resolve) => {
    const script = document.createElement("script");
    script.src =
      `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}` +
      `&libraries=places&language=pt-BR&region=BR`;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve((window as unknown as { google?: GMaps }).google?.maps ?? null);
    script.onerror = () => {
      scriptPromise = null; // permite retry numa próxima montagem
      resolve(null);
    };
    document.head.appendChild(script);
  });
  return scriptPromise;
}

/** Exposto para a UI decidir se mostra o fallback manual de lat/lng. */
export const isGooglePlacesEnabled = Boolean(apiKey);

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
  const inputRef = React.useRef<HTMLInputElement>(null);
  const onSelectRef = React.useRef(onSelect);
  onSelectRef.current = onSelect;

  React.useEffect(() => {
    let cancelled = false;
    if (!isGooglePlacesEnabled) return;

    loadPlaces().then((maps) => {
      if (cancelled || !maps?.places || !inputRef.current) return;
      const ac = new maps.places.Autocomplete(inputRef.current, {
        fields: ["formatted_address", "geometry", "name"],
        componentRestrictions: { country: "br" },
        types: ["geocode"],
      });
      ac.addListener("place_changed", () => {
        const place = ac.getPlace();
        const loc = place.geometry?.location;
        const address = place.formatted_address ?? place.name ?? "";
        if (address) onChange(address);
        if (loc) {
          onSelectRef.current({ address, latitude: loc.lat(), longitude: loc.lng() });
        }
      });
    });

    return () => {
      cancelled = true;
    };
  }, [onChange]);

  return (
    <Input
      ref={inputRef}
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder ?? "Digite o endereço do estacionamento"}
      disabled={disabled}
      autoComplete="off"
    />
  );
}
