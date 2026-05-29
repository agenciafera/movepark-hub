import { Car, ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Grid de fotos do listing — Airbnb-style (1 grande + 4 pequenas) no desktop,
 * carrossel horizontal no mobile.
 *
 * MVP: usa placeholders (gradiente Movepark + ícone). Quando `location_photo`
 * tiver URLs, troca pelas fotos reais.
 */
type Props = {
  title: string;
  photoUrls?: string[];
};

const placeholderClasses = [
  "bg-soft-gradient",
  "bg-mp-pale",
  "bg-surface-soft",
  "bg-mp-pale",
  "bg-soft-gradient",
];

export function PhotoGrid({ title, photoUrls }: Props) {
  const photos = photoUrls?.slice(0, 5) ?? [];
  const slots = Array.from({ length: 5 }).map((_, i) => photos[i] ?? null);

  return (
    <div>
      {/* Mobile — carrossel */}
      <div className="tablet:hidden -mx-4 flex snap-x snap-mandatory gap-2 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {slots.map((url, i) => (
          <div
            key={i}
            className={cn(
              "relative aspect-[4/5] w-[88%] shrink-0 snap-center overflow-hidden rounded-md",
              !url && placeholderClasses[i % placeholderClasses.length],
            )}
            aria-label={`Foto ${i + 1} de ${title}`}
          >
            {url ? (
              <img src={url} alt="" className="h-full w-full object-cover" />
            ) : (
              <PlaceholderInner />
            )}
          </div>
        ))}
      </div>

      {/* Desktop — grid 1 grande + 4 pequenas */}
      <div className="hidden tablet:grid h-[420px] grid-cols-4 grid-rows-2 gap-2 overflow-hidden rounded-md">
        <div
          className={cn(
            "relative col-span-2 row-span-2 overflow-hidden",
            !slots[0] && placeholderClasses[0],
          )}
        >
          {slots[0] ? <img src={slots[0]} alt="" className="h-full w-full object-cover" /> : <PlaceholderInner large />}
        </div>
        {slots.slice(1).map((url, i) => (
          <div
            key={i}
            className={cn(
              "relative overflow-hidden",
              !url && placeholderClasses[(i + 1) % placeholderClasses.length],
            )}
          >
            {url ? <img src={url} alt="" className="h-full w-full object-cover" /> : <PlaceholderInner />}
          </div>
        ))}
      </div>
    </div>
  );
}

function PlaceholderInner({ large = false }: { large?: boolean }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-mp-indigo/40">
      <Car className={large ? "h-16 w-16" : "h-10 w-10"} />
      <span className="text-caption-sm flex items-center gap-1">
        <ImageIcon className="h-3 w-3" />
        Foto em breve
      </span>
    </div>
  );
}
