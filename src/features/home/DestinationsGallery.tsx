import { Plane } from "lucide-react";

const items = [
  { label: "Aeroporto de Guarulhos", city: "São Paulo · GRU" },
  { label: "Aeroporto de Congonhas", city: "São Paulo · CGH" },
  { label: "Aeroporto Internacional de Confins", city: "Belo Horizonte · CNF" },
  { label: "Aeroporto do Galeão", city: "Rio de Janeiro · GIG" },
  { label: "Aeroporto de Fortaleza", city: "Fortaleza · FOR" },
  { label: "Aeroporto Afonso Pena", city: "Curitiba · CWB" },
  { label: "Aeroporto de Viracopos", city: "Campinas · VCP" },
  { label: "Aeroporto Salgado Filho", city: "Porto Alegre · POA" },
];

// Duplicamos para loop contínuo sem salto
const loop = [...items, ...items];

function PhotoCard({ label, city }: { label: string; city: string }) {
  return (
    <div className="group relative flex h-[320px] w-[260px] shrink-0 cursor-pointer flex-col items-center justify-center overflow-hidden rounded-2xl border border-hairline bg-gradient-to-br from-mp-pale via-surface-soft to-white transition-shadow hover:shadow-tier">
      {/* Fundo decorativo */}
      <div className="absolute inset-0 bg-gradient-to-br from-mp-pale/80 to-transparent" />

      {/* Ícone placeholder */}
      <div className="relative mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-white shadow-tier">
        <Plane className="h-7 w-7 text-mp-indigo/50" />
      </div>

      <span className="relative px-6 text-center text-[15px] font-semibold leading-snug text-ink/70">
        {label}
      </span>
      <span className="relative mt-1.5 text-caption text-muted">{city}</span>

      {/* Badge placeholder */}
      <span className="absolute bottom-4 left-4 flex items-center gap-1 rounded-full bg-white/80 px-2.5 py-1 backdrop-blur-sm">
        <Plane className="h-3 w-3 text-mp-indigo" />
        <span className="text-[10px] font-bold uppercase tracking-wider text-mp-indigo">
          placeholder
        </span>
      </span>
    </div>
  );
}

export function DestinationsGallery() {
  return (
    <section className="py-16 desktop:py-20">
      {/* Cabeçalho com largura máxima */}
      <div className="mx-auto mb-10 max-w-[1280px] px-6 desktop:px-8">
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

      {/* Faixa full-width com scroll ao hover */}
      <div className="group overflow-hidden">
        {/* [animation-play-state:paused] por default; running ao hover do container */}
        <div className="flex w-max gap-4 px-4 animate-marquee [animation-play-state:paused] group-hover:[animation-play-state:running]">
          {loop.map((item, i) => (
            <PhotoCard key={`${item.label}-${i}`} label={item.label} city={item.city} />
          ))}
        </div>
      </div>
    </section>
  );
}
