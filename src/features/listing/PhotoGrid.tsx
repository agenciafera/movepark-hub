import * as React from "react";
import { Car, ChevronLeft, ChevronRight, Grid2x2, ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { imageSrcSet, optimizedImageUrl } from "@/lib/storage";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { wrapIndex } from "./PhotoGrid.logic";

/**
 * Grid de fotos do listing — Airbnb-style (1 grande + 4 pequenas) no desktop,
 * carrossel horizontal no mobile. Mantém a composição mesmo sem fotos suficientes:
 * slots vazios viram placeholder "Foto em breve" no mesmo layout.
 *
 * As fotos preenchem o slot com `object-cover` (recorte/máscara) — preserva a
 * proporção sem distorcer, respeitando os limites do layout. Clicar abre o
 * lightbox, que mostra a foto inteira (`object-contain`) e navega por todas.
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
  const photos = (photoUrls ?? []).filter(Boolean);
  const grid = Array.from({ length: 5 }).map((_, i) => photos[i] ?? null);
  const hasPhotos = photos.length > 0;

  const [open, setOpen] = React.useState(false);
  const [active, setActive] = React.useState(0);

  const openAt = (i: number) => {
    setActive(i);
    setOpen(true);
  };

  return (
    <div>
      {/* Mobile — carrossel */}
      <div className="tablet:hidden -mx-4 flex snap-x snap-mandatory gap-2 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {grid.map((url, i) => (
          <Slot
            key={i}
            url={url}
            index={i}
            title={title}
            width={680}
            onOpen={openAt}
            className="aspect-[4/5] w-[88%] shrink-0 snap-center rounded-md"
          />
        ))}
      </div>

      {/* Desktop — grid 1 grande + 4 pequenas */}
      <div className="relative hidden h-[420px] grid-cols-4 grid-rows-2 gap-2 overflow-hidden rounded-md tablet:grid">
        <Slot
          url={grid[0]}
          index={0}
          title={title}
          width={900}
          large
          onOpen={openAt}
          className="col-span-2 row-span-2"
        />
        {grid.slice(1).map((url, i) => (
          <Slot
            key={i}
            url={url}
            index={i + 1}
            title={title}
            width={460}
            onOpen={openAt}
          />
        ))}

        {hasPhotos && (
          <button
            type="button"
            onClick={() => openAt(0)}
            className="absolute bottom-3 right-3 inline-flex items-center gap-2 rounded-full border border-hairline bg-canvas/95 px-3 py-1.5 text-body-sm font-medium text-ink shadow-tier backdrop-blur transition hover:bg-canvas"
          >
            <Grid2x2 className="h-4 w-4" />
            Ver todas as fotos
            {photos.length > 1 && <span className="text-muted">({photos.length})</span>}
          </button>
        )}
      </div>

      {hasPhotos && (
        <Lightbox
          title={title}
          photos={photos}
          open={open}
          active={active}
          onOpenChange={setOpen}
          onActiveChange={setActive}
        />
      )}
    </div>
  );
}

type SlotProps = {
  url: string | null;
  index: number;
  title: string;
  width: number;
  large?: boolean;
  onOpen: (index: number) => void;
  className?: string;
};

function Slot({ url, index, title, width, large = false, onOpen, className }: SlotProps) {
  const base = "relative overflow-hidden";
  if (!url) {
    return (
      <div className={cn(base, placeholderClasses[index % placeholderClasses.length], className)}>
        <PlaceholderInner large={large} />
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={() => onOpen(index)}
      aria-label={`Abrir foto ${index + 1} de ${title}`}
      className={cn(base, "group cursor-zoom-in", className)}
    >
      <img
        src={optimizedImageUrl(url, { width, quality: 70, resize: "cover" })}
        srcSet={imageSrcSet(url, [width, width * 2], 70)}
        sizes={large ? "(min-width: 768px) 50vw, 88vw" : "(min-width: 768px) 25vw, 88vw"}
        alt={`Foto ${index + 1} de ${title}`}
        loading={large && index === 0 ? "eager" : "lazy"}
        decoding="async"
        className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]"
      />
    </button>
  );
}

type LightboxProps = {
  title: string;
  photos: string[];
  open: boolean;
  active: number;
  onOpenChange: (open: boolean) => void;
  onActiveChange: (index: number) => void;
};

function Lightbox({ title, photos, open, active, onOpenChange, onActiveChange }: LightboxProps) {
  const go = React.useCallback(
    (delta: number) => onActiveChange(wrapIndex(active, photos.length, delta)),
    [active, photos.length, onActiveChange],
  );

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, go]);

  const current = photos[active] ?? photos[0];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl border-0 bg-transparent p-0 shadow-none">
        <DialogTitle className="sr-only">Fotos de {title}</DialogTitle>
        <DialogDescription className="sr-only">
          Galeria de fotos. Use as setas para navegar.
        </DialogDescription>

        <div className="flex flex-col gap-3">
          <div className="relative flex items-center justify-center">
            <img
              src={optimizedImageUrl(current, { width: 1600, quality: 80 })}
              alt={`Foto ${active + 1} de ${title}`}
              decoding="async"
              className="max-h-[78vh] w-auto max-w-full rounded-md object-contain"
            />

            {photos.length > 1 && (
              <>
                <NavButton side="left" onClick={() => go(-1)} />
                <NavButton side="right" onClick={() => go(1)} />
                <span
                  data-testid="lightbox-counter"
                  className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 text-caption-sm font-medium text-white"
                >
                  {active + 1} / {photos.length}
                </span>
              </>
            )}
          </div>

          {photos.length > 1 && (
            <div className="flex justify-center gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {photos.map((url, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => onActiveChange(i)}
                  aria-label={`Ir para a foto ${i + 1}`}
                  aria-current={i === active}
                  className={cn(
                    "h-14 w-20 shrink-0 overflow-hidden rounded-sm ring-2 transition",
                    i === active ? "ring-white" : "ring-transparent opacity-60 hover:opacity-100",
                  )}
                >
                  <img
                    src={optimizedImageUrl(url, { width: 160, quality: 60, resize: "cover" })}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className="h-full w-full object-cover"
                  />
                </button>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function NavButton({ side, onClick }: { side: "left" | "right"; onClick: () => void }) {
  const Icon = side === "left" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={side === "left" ? "Foto anterior" : "Próxima foto"}
      className={cn(
        "absolute top-1/2 -translate-y-1/2 inline-flex h-10 w-10 items-center justify-center rounded-full bg-black/55 text-white transition hover:bg-black/75",
        side === "left" ? "left-3" : "right-3",
      )}
    >
      <Icon className="h-5 w-5" />
    </button>
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
