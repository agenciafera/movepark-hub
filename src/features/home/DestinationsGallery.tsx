import { Plane, Image } from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { label: "Aeroporto de Guarulhos", city: "São Paulo · GRU", tall: true },
  { label: "Aeroporto de Congonhas", city: "São Paulo · CGH", tall: false },
  { label: "Aeroporto Internacional de Confins", city: "Belo Horizonte · CNF", tall: false },
  { label: "Aeroporto do Galeão", city: "Rio de Janeiro · GIG", tall: true },
  { label: "Aeroporto de Fortaleza", city: "Fortaleza · FOR", tall: false },
];

function PhotoCard({
  label,
  city,
  tall,
}: {
  label: string;
  city: string;
  tall: boolean;
}) {
  return (
    <div
      className={cn(
        "group relative flex shrink-0 w-[200px] tablet:w-[240px] desktop:w-[260px] cursor-pointer flex-col items-center justify-center overflow-hidden rounded-md border-2 border-dashed border-hairline bg-gradient-to-br from-mp-pale to-surface-soft transition-all hover:border-mp-violet hover:shadow-tier",
        tall ? "h-72 tablet:h-80" : "h-52 tablet:h-60",
      )}
    >
      <Image className="mb-3 h-8 w-8 text-mp-indigo/40" aria-hidden="true" />
      <span className="px-4 text-center text-caption font-medium text-ink/60">{label}</span>
      <span className="mt-1 text-caption-sm text-muted">{city}</span>
      <span className="absolute bottom-3 left-3 flex items-center gap-1 rounded-full bg-white/70 px-2 py-0.5 backdrop-blur-sm">
        <Plane className="h-3 w-3 text-mp-indigo" />
        <span className="text-[10px] font-bold uppercase tracking-wider text-mp-indigo">placeholder</span>
      </span>
    </div>
  );
}

export function DestinationsGallery() {
  return (
    <section className="py-16 desktop:py-20">
      <div className="mx-auto mb-8 max-w-[1280px] px-6 desktop:px-8">
        <p className="mb-2 text-caption-sm font-bold uppercase tracking-widest text-mp-violet">
          Destinos em destaque
        </p>
        <h2 className="text-[28px] font-bold tracking-tight text-ink tablet:text-[36px]">
          Estacione nos principais
          <br className="hidden tablet:block" /> aeroportos do Brasil
        </h2>
        <p className="mt-3 max-w-xl text-body-md text-muted">
          Cobertura nas maiores capitais, com operadoras verificadas e vagas garantidas para você
          viajar tranquilo.
        </p>
      </div>

      <div className="mx-auto max-w-[1280px] px-6 desktop:px-8">
        <div className="flex items-end gap-4 overflow-x-auto pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {items.map((item) => (
            <PhotoCard key={item.label} {...item} />
          ))}
        </div>
      </div>
    </section>
  );
}
