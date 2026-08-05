import { ArrowSquareOut } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { GoogleMapEmbed } from "@/components/shared/GoogleMapEmbed";
import { buildGoogleMapsHref } from "@/components/shared/googleMapEmbed.logic";

type Props = {
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  /** Place ID do Google, quando a unidade tem. Dá o pin com o nome do estacionamento. */
  placeId?: string | null;
};

/**
 * Endereço, mapa do Google e o atalho para abrir a rota fora. Fica no bloco "Como chegar" do
 * detalhe da unidade. Antes era um SVG estático com "Mapa em breve"; hoje é a Maps Embed API
 * (ver `googleMapEmbed.logic.ts` para o porquê da Embed e não da JS API).
 */
export function MiniMap({ address, latitude, longitude, placeId }: Props) {
  const target = { placeId, latitude, longitude, address };

  return (
    <div className="space-y-3">
      <p className="text-body-md text-ink">{address ?? "Endereço não cadastrado ainda."}</p>

      <GoogleMapEmbed
        title={address ? `Mapa de ${address}` : "Mapa da unidade"}
        target={target}
        className="h-56 w-full rounded-md border border-hairline"
      />

      <Button variant="secondary" size="sm" asChild>
        <a href={buildGoogleMapsHref(target)} target="_blank" rel="noreferrer">
          <ArrowSquareOut className="h-4 w-4" />
          Ver no Google Maps
        </a>
      </Button>
    </div>
  );
}
