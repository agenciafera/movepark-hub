import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { useGsapReveal } from "@/hooks/useGsapReveal";

export function CtaBanner() {
  const ref = useGsapReveal<HTMLElement>({ y: 32, duration: 0.75, start: "top 88%" });
  return (
    <section ref={ref} className="px-6 pt-4 pb-16 desktop:px-8 desktop:pb-20">
      <div className="relative mx-auto max-w-[1280px] overflow-hidden rounded-3xl">
      {/* Foto de fundo */}
      <img
        src="/images/bg_cta-section-movepark-hub.png"
        alt=""
        aria-hidden="true"
        className="absolute inset-0 h-full w-full object-cover object-center"
      />
      {/* Overlay escuro para legibilidade do texto */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(to bottom, hsl(var(--scrim-deep-hsl) / 0.72) 0%, hsl(var(--scrim-deep-hsl) / 0.60) 50%, hsl(var(--scrim-deep-hsl) / 0.78) 100%)",
        }}
        aria-hidden="true"
      />
      {/* Acento roxo sutil */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at 70% 50%, hsl(239 82% 65% / 0.20) 0%, transparent 60%)",
        }}
        aria-hidden="true"
      />

      <div className="relative z-10 px-6 py-20 text-center desktop:px-8 desktop:py-28">
        <p className="mb-3 text-caption-sm font-bold uppercase tracking-widest text-mp-pale/70">
          Reserve com antecedência
        </p>
        <h2 className="mb-5 text-display-2xl font-bold text-white tablet:text-display-3xl">
          Garanta sua vaga antes
          <br className="hidden tablet:block" /> da sua próxima viagem
        </h2>
        <p className="mx-auto mb-10 max-w-lg text-[17px] leading-relaxed text-white/70">
          Preço garantido, cancelamento grátis e voucher na hora. Sem filas, sem surpresas.
        </p>
        <Link
          to="/search"
          className="inline-flex items-center gap-2 rounded-full bg-white px-8 py-4 text-button-md font-semibold text-mp-navy transition-all hover:bg-mp-pale hover:gap-3"
        >
          Buscar vagas agora <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
      </div>
    </section>
  );
}
