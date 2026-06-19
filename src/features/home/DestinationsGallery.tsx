import { Plane } from "lucide-react";

// height em px, dy = deslocamento vertical em px (positivo = para baixo)
const items: { label: string; city: string; h: number; dy: number }[] = [
  { label: "Aeroporto de Guarulhos",              city: "São Paulo · GRU",      h: 340, dy: -30 },
  { label: "Aeroporto de Congonhas",              city: "São Paulo · CGH",      h: 400, dy:  40 },
  { label: "Aeroporto Internacional de Confins",  city: "Belo Horizonte · CNF", h: 260, dy: -45 },
  { label: "Aeroporto do Galeão",                 city: "Rio de Janeiro · GIG", h: 370, dy:  25 },
  { label: "Aeroporto de Fortaleza",              city: "Fortaleza · FOR",      h: 300, dy: -20 },
  { label: "Aeroporto Afonso Pena",               city: "Curitiba · CWB",       h: 390, dy:  50 },
  { label: "Aeroporto de Viracopos",              city: "Campinas · VCP",       h: 270, dy: -35 },
  { label: "Aeroporto Salgado Filho",             city: "Porto Alegre · POA",   h: 350, dy:  10 },
];

const loop = [...items, ...items];

function PhotoCard({ label, city, h, dy }: { label: string; city: string; h: number; dy: number }) {
  return (
    <div
      className="relative w-[230px] shrink-0 cursor-pointer overflow-hidden rounded-2xl bg-gradient-to-br from-mp-pale via-surface-soft to-blue-50 transition-shadow hover:shadow-tier"
      style={{ height: h, transform: `translateY(${dy}px)` }}
    >
      {/* Gradiente de fundo decorativo */}
      <div className="absolute inset-0 bg-gradient-to-b from-mp-indigo/5 to-mp-navy/10" />

      {/* Ícone centralizado */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white/60 backdrop-blur-sm">
          <Plane className="h-6 w-6 text-mp-indigo/50" />
        </div>
      </div>

      {/* Texto sobreposto na base */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/40 to-transparent p-4 pt-8">
        <p className="text-[13px] font-semibold leading-snug text-white drop-shadow">{label}</p>
        <p className="mt-0.5 text-[11px] text-white/75">{city}</p>
      </div>

      {/* Badge placeholder */}
      <span className="absolute left-3 top-3 flex items-center gap-1 rounded-full bg-white/70 px-2 py-0.5 backdrop-blur-sm">
        <Plane className="h-3 w-3 text-mp-indigo" />
        <span className="text-[9px] font-bold uppercase tracking-wider text-mp-indigo">placeholder</span>
      </span>
    </div>
  );
}

export function DestinationsGallery() {
  return (
    <section className="py-16 desktop:py-20">
      {/* Cabeçalho com largura máxima */}
      <div className="mx-auto mb-12 max-w-[1280px] px-6 desktop:px-8">
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

      {/* Faixa full-width — altura fixa para clipar cards acima/abaixo */}
      <div className="group overflow-hidden" style={{ height: 520 }}>
        {/* Margem extra no topo para dar espaço aos cards deslocados para cima */}
        <div
          className="flex items-center gap-4 px-4 animate-marquee [animation-play-state:paused] group-hover:[animation-play-state:running]"
          style={{ marginTop: 80 }}
        >
          {loop.map((item, i) => (
            <PhotoCard key={`${item.label}-${i}`} {...item} />
          ))}
        </div>
      </div>
    </section>
  );
}
