import { useSearchParams } from "react-router-dom";
import { SearchBarPill } from "@/features/search/SearchBarPill";

function parseDate(value: string | null): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

function StarIcon() {
  return (
    <svg className="h-3.5 w-3.5 fill-yellow-400" viewBox="0 0 20 20">
      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
    </svg>
  );
}

export function Hero() {
  const [params] = useSearchParams();
  return (
    <section className="relative flex min-h-[600px] items-end overflow-hidden bg-mp-navy desktop:min-h-[680px]">
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{
          backgroundImage:
            'url("https://images.unsplash.com/photo-1545173168-9f1947eebb7f?auto=format&fit=crop&w=1920&q=80")',
        }}
        aria-hidden="true"
      />
      {/* Gradient de baixo para cima — text legibility no bottom, abertura no topo */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(to top, hsl(248 26% 20% / 0.92) 0%, hsl(248 26% 20% / 0.55) 45%, hsl(248 26% 20% / 0.18) 100%)",
        }}
        aria-hidden="true"
      />

      <div className="relative z-10 mx-auto w-full max-w-5xl px-6 pb-20 pt-36 desktop:px-8 desktop:pb-24">
        {/* Badge de prova social */}
        <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-1.5 backdrop-blur-sm">
          <span className="flex gap-0.5">
            {[...Array(5)].map((_, i) => (
              <StarIcon key={i} />
            ))}
          </span>
          <span className="text-caption-sm text-white/90">5.000+ reservas concluídas</span>
        </div>

        <h1 className="mb-4 max-w-3xl text-display-2xl font-bold text-white tablet:text-display-3xl">
          Estacione com confiança em qualquer aeroporto
        </h1>
        <p className="mb-10 max-w-xl text-[17px] leading-relaxed text-white/80">
          Compare vagas de várias operadoras num só lugar, com reserva instantânea.
        </p>

        <SearchBarPill
          initialDest={params.get("dest")}
          initialFrom={parseDate(params.get("from"))}
          initialTo={parseDate(params.get("to"))}
        />
      </div>
    </section>
  );
}
