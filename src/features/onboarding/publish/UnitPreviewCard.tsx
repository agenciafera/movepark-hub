import { MapPin, BusFront, Check } from "lucide-react";
import { formatBRL } from "@/lib/format";

/**
 * Preview vivo da unidade tomando forma no wizard "Publicar" (E1.9). É a recompensa contínua do
 * split-screen: à medida que o dono preenche, ele vê como a unidade vai aparecer. Puramente
 * presentacional; recebe o estado local do wizard.
 */
export type PreviewItem = { name: string; base_price: number | null; capacity: number };

export function UnitPreviewCard({
  name,
  address,
  destinationName,
  hasShuttle,
  items,
  coverPhoto,
}: {
  name: string;
  address: string;
  destinationName: string | null;
  hasShuttle: boolean | null;
  items: PreviewItem[];
  /** 1ª foto da unidade, se o parceiro já subiu. Sem foto, cai na ilustrativa. */
  coverPhoto?: string | null;
}) {
  const filled = items.filter((i) => i.capacity > 0 || (i.base_price ?? 0) > 0);
  const minPrice = filled.reduce<number | null>((min, i) => {
    const p = i.base_price;
    if (p == null || p <= 0) return min;
    return min == null ? p : Math.min(min, p);
  }, null);

  return (
    <div className="overflow-hidden rounded-lg border border-hairline bg-canvas shadow-tier">
      {/* Faixa de imagem: usa a 1ª foto da unidade se o parceiro já subiu; senão, a ilustrativa. */}
      <div className="relative h-28 bg-mp-navy">
        <img
          src={coverPhoto || "/images/estacionamento-preview-thumb.webp"}
          alt={coverPhoto ? `Foto de ${name || "sua unidade"}` : ""}
          aria-hidden={coverPhoto ? undefined : true}
          className="h-full w-full object-cover"
          loading="lazy"
          decoding="async"
        />
        {destinationName && (
          <span className="absolute left-3 top-3 rounded-full bg-white/90 px-2.5 py-1 text-caption-sm font-medium text-mp-navy">
            Perto de {destinationName}
          </span>
        )}
      </div>

      <div className="flex flex-col gap-3 p-4">
        <div>
          <h3 className="text-title-md text-ink">{name || "Sua unidade"}</h3>
          <p className="mt-0.5 flex items-start gap-1 text-body-sm text-muted">
            <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{address || "Endereço aparece aqui"}</span>
          </p>
        </div>

        {hasShuttle && (
          <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-mp-pale px-2.5 py-1 text-caption-sm font-medium text-mp-indigo">
            <BusFront className="h-3.5 w-3.5" /> Com transfer
          </span>
        )}

        {filled.length > 0 && (
          <div className="flex flex-col gap-1.5 border-t border-hairline pt-3">
            {filled.map((i) => (
              <div key={i.name} className="flex items-center justify-between text-body-sm">
                <span className="flex items-center gap-1.5 text-ink">
                  <Check className="h-3.5 w-3.5 text-success" /> {i.name}
                </span>
                <span className="text-muted">
                  {i.base_price ? formatBRL(i.base_price) : "a definir"}
                  {i.capacity > 0 && <span className="text-caption-sm"> · {i.capacity} vagas</span>}
                </span>
              </div>
            ))}
          </div>
        )}

        {minPrice != null && (
          <div className="border-t border-hairline pt-3">
            <span className="text-caption-sm text-muted">a partir de</span>
            <p className="text-title-lg text-ink">
              {formatBRL(minPrice)}
              <span className="text-body-sm font-normal text-muted"> /diária</span>
            </p>
            <p className="text-caption-sm text-muted-steel">
preço de balcão. A Movepark calcula o online
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
