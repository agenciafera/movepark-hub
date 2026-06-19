import { Plane } from "lucide-react";

// height em px, dy = deslocamento vertical em px (positivo = para baixo)
const items: { label: string; city: string; h: number; dy: number; img: string }[] = [
  { label: "Aeroporto de Guarulhos",             city: "São Paulo · GRU",      h: 340, dy: -30, img: "/airports/terminal-passageiros.jpg"  },
  { label: "Aeroporto de Congonhas",             city: "São Paulo · CGH",      h: 400, dy:  40, img: "/airports/aviao-poente.avif"          },
  { label: "Aeroporto Internacional de Confins", city: "Belo Horizonte · CNF", h: 260, dy: -45, img: "/airports/aviao-noite.jpeg"           },
  { label: "Aeroporto do Galeão",                city: "Rio de Janeiro · GIG", h: 370, dy:  25, img: "/airports/painel-embarque.jpg"        },
  { label: "Aeroporto de Fortaleza",             city: "Fortaleza · FOR",      h: 300, dy: -20, img: "/airports/exterior-aeroporto.avif"    },
  { label: "Aeroporto Afonso Pena",              city: "Curitiba · CWB",       h: 390, dy:  50, img: "/airports/terminal-checkin.webp"      },
  { label: "Aeroporto de Viracopos",             city: "Campinas · VCP",       h: 270, dy: -35, img: "/airports/terminal-interno-1.avif"    },
  { label: "Aeroporto Salgado Filho",            city: "Porto Alegre · POA",   h: 350, dy:  10, img: "/airports/terminal-interno-2.avif"    },
];

const loop = [...items, ...items];

function PhotoCard({
  label,
  city,
  h,
  dy,
  img,
}: {
  label: string;
  city: string;
  h: number;
  dy: number;
  img: string;
}) {
  return (
    <div
      className="relative w-[360px] shrink-0 cursor-pointer overflow-hidden rounded-2xl bg-mp-pale transition-shadow hover:shadow-tier"
      style={{ height: h, transform: `translateY(${dy}px)` }}
    >
      {/* Foto de fundo */}
      <img
        src={img}
        alt={label}
        className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
        loading="lazy"
        decoding="async"
      />

      {/* Overlay gradiente para legibilidade */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />

      {/* Texto sobreposto na base */}
      <div className="absolute bottom-0 left-0 right-0 p-5">
        <p className="text-[14px] font-semibold leading-snug text-white drop-shadow-sm">{label}</p>
        <p className="mt-0.5 flex items-center gap-1.5 text-[12px] text-white/75">
          <Plane className="h-3 w-3" />
          {city}
        </p>
      </div>
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
      <div className="group overflow-hidden" style={{ height: 620 }}>
        {/* Margem extra no topo para dar espaço aos cards deslocados para cima */}
        <div
          className="flex items-center gap-6 px-6 animate-marquee [animation-play-state:paused] group-hover:[animation-play-state:running]"
          style={{ marginTop: 90 }}
        >
          {loop.map((item, i) => (
            <PhotoCard key={`${item.label}-${i}`} label={item.label} city={item.city} h={item.h} dy={item.dy} img={item.img} />
          ))}
        </div>
      </div>
    </section>
  );
}
