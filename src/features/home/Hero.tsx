import { useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { SearchBarPill } from "@/features/search/SearchBarPill";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";

function parseDate(value: string | null): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

function StarIcon() {
  return (
    <svg className="h-3 w-3 fill-yellow-400" viewBox="0 0 20 20">
      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg className="h-3.5 w-3.5 shrink-0 text-mp-teal" fill="currentColor" viewBox="0 0 20 20">
      <path
        fillRule="evenodd"
        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
        clipRule="evenodd"
      />
    </svg>
  );
}

const trustPills = ["Cancelamento grátis", "Preço travado", "Estacionamentos verificados"];
const heroAvatars = [
  "https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=64&q=80",
  "https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=64&q=80",
  "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=64&q=80",
  "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=64&q=80",
];

export function Hero() {
  const [params] = useSearchParams();
  const sectionRef = useRef<HTMLElement>(null);
  const spotlightRef = useRef<HTMLDivElement>(null);

  function handleMouseMove(e: React.MouseEvent<HTMLElement>) {
    const rect = sectionRef.current?.getBoundingClientRect();
    if (!rect || !spotlightRef.current) return;
    const x = e.clientX - rect.left - 350;
    const y = e.clientY - rect.top - 350;
    spotlightRef.current.style.transform = `translate(${x}px, ${y}px)`;
  }

  function handleMouseEnter() {
    if (!spotlightRef.current) return;
    spotlightRef.current.style.transition = "transform 0.12s ease-out, opacity 0.3s ease";
    spotlightRef.current.style.opacity = "1";
  }

  function handleMouseLeave() {
    if (!spotlightRef.current || !sectionRef.current) return;
    const rect = sectionRef.current.getBoundingClientRect();
    spotlightRef.current.style.transition = "transform 1s ease-out, opacity 0.5s ease";
    spotlightRef.current.style.transform = `translate(${rect.width / 2 - 350}px, ${rect.height / 2 - 350}px)`;
    spotlightRef.current.style.opacity = "0";
  }

  return (
    <section
      ref={sectionRef}
      onMouseMove={handleMouseMove}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className="relative overflow-hidden"
      style={{
        // Céu blue-hour: cobalt navy profundo → índigo rico → violet-slate → escuro no fundo (área de texto)
        background: [
          // Vignette sutil — escurece as bordas como lente de câmera
          "radial-gradient(ellipse 115% 100% at 50% 50%, transparent 38%, hsla(228, 60%, 4%, 0.55) 100%)",
          // Glow horizonte âmbar-rosado — luz do sol abaixo do horizonte
          "radial-gradient(ellipse 70% 18% at 50% 73%, hsla(14, 58%, 52%, 0.20) 0%, transparent 68%)",
          // Bloom atmosférico violeta frio — trajetória ascendente do avião
          "radial-gradient(ellipse 82% 54% at 42% 26%, hsla(239, 82%, 65%, 0.22) 0%, transparent 62%)",
          // Toque teal da marca — canto superior esquerdo, haze atmosférico
          "radial-gradient(ellipse 44% 32% at 9% 16%, hsla(184, 44%, 76%, 0.07) 0%, transparent 65%)",
          // Base: gradiente vertical de céu — topo navy profundo → índigo → violet → navy escuro
          "linear-gradient(to bottom, hsl(224 58% 7%) 0%, hsl(229 64% 12%) 22%, hsl(238 72% 17%) 45%, hsl(244 54% 20%) 63%, hsl(250 40% 17%) 76%, hsl(235 48% 11%) 88%, hsl(228 52% 7%) 100%)",
        ].join(", "),
        borderRadius: "0 0 3rem 3rem",
        minHeight: "640px",
      }}
    >
      {/* Spotlight que segue o cursor — manipulação direta do DOM, sem re-render */}
      <div
        ref={spotlightRef}
        className="pointer-events-none absolute left-0 top-0"
        style={{
          width: "700px",
          height: "700px",
          borderRadius: "50%",
          background:
            "radial-gradient(circle, hsla(239, 82%, 72%, 0.18) 0%, hsla(239, 70%, 60%, 0.08) 40%, transparent 70%)",
          opacity: 0,
          willChange: "transform, opacity",
        }}
        aria-hidden="true"
      />

      {/* Film grain cinematográfico — feTurbulence fractalNoise */}
      <svg
        className="pointer-events-none absolute inset-0 h-full w-full"
        style={{ opacity: 0.042 }}
        aria-hidden="true"
        xmlns="http://www.w3.org/2000/svg"
      >
        <filter id="hero-grain" x="0%" y="0%" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.68 0.72" numOctaves="4" stitchTiles="stitch" />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter="url(#hero-grain)" />
      </svg>

      {/* Haze atmosférico difuso — volume de luz índigo no meio do céu */}
      <div
        className="pointer-events-none absolute"
        style={{
          top: "32%", left: "50%",
          width: "720px", height: "280px",
          transform: "translate(-50%, -50%)",
          background: "hsl(239 70% 52%)",
          opacity: 0.09,
          filter: "blur(90px)",
          borderRadius: "50%",
          willChange: "filter",
        }}
        aria-hidden="true"
      />

      {/* Glow horizonte — calor difuso da luz abaixo do horizon line */}
      <div
        className="pointer-events-none absolute"
        style={{
          top: "74%", left: "50%",
          width: "520px", height: "140px",
          transform: "translate(-50%, -50%)",
          background: "hsl(14 62% 48%)",
          opacity: 0.055,
          filter: "blur(72px)",
          borderRadius: "50%",
          willChange: "filter",
        }}
        aria-hidden="true"
      />

      <div className="relative z-10 mx-auto flex w-full max-w-5xl flex-col items-center justify-center px-6 pb-20 pt-32 text-center desktop:px-8 desktop:pb-24">
        {/* Badge de prova social */}
        <div
          className="mb-8 inline-flex items-center gap-3 rounded-full border border-white/10 px-4 py-2"
          style={{ background: "rgba(255,255,255,0.06)" }}
        >
          <div className="flex -space-x-2">
            {heroAvatars.map((src) => (
              <Avatar key={src} className="h-6 w-6 ring-1 ring-white/20">
                <AvatarImage src={src} alt="Viajante" />
                <AvatarFallback>?</AvatarFallback>
              </Avatar>
            ))}
          </div>
          <div className="flex items-center gap-1.5">
            <div className="flex gap-0.5">
              {[0, 1, 2, 3, 4].map((i) => (
                <StarIcon key={i} />
              ))}
            </div>
            <span className="text-[13px] font-medium text-white/75">5.000+ reservas</span>
          </div>
        </div>

        <h1
          className="mx-auto mb-5 max-w-3xl text-[40px] font-bold text-white tablet:text-[54px]"
          style={{ lineHeight: 1.09, letterSpacing: "-0.7px", textWrap: "balance" } as React.CSSProperties}
        >
          Estacione em qualquer aeroporto do Brasil
        </h1>

        <p className="mx-auto mb-10 max-w-xl text-[17px] leading-relaxed text-white/60">
          Compare vários estacionamentos num só lugar e reserve na hora.
        </p>

        <SearchBarPill
          initialDest={params.get("dest")}
          initialFrom={parseDate(params.get("from"))}
          initialTo={parseDate(params.get("to"))}
          className="mx-auto w-full"
        />

        {/* Trust pills */}
        <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
          {trustPills.map((label) => (
            <span key={label} className="inline-flex items-center gap-1.5 text-[13px] text-white/70">
              <CheckIcon />
              {label}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
