import { useNavigate } from "react-router-dom";
import { ArrowRight } from "lucide-react";

export function CtaBanner() {
  const navigate = useNavigate();
  return (
    <section className="relative overflow-hidden">
      {/* Placeholder de foto de fundo */}
      <div
        className="absolute inset-0 bg-mp-navy"
        aria-hidden="true"
      />
      {/* Gradiente decorativo sobre o fundo */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at 70% 50%, hsl(239 82% 65% / 0.35) 0%, transparent 65%)",
        }}
        aria-hidden="true"
      />
      {/* Placeholder label */}
      <div className="absolute right-6 top-6 rounded-full bg-white/10 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-white/50">
        foto de fundo — placeholder
      </div>

      <div className="relative z-10 mx-auto max-w-[1280px] px-6 py-20 text-center desktop:px-8 desktop:py-28">
        <p className="mb-3 text-caption-sm font-bold uppercase tracking-widest text-mp-pale/70">
          Reserve com antecedência
        </p>
        <h2 className="mb-5 text-[32px] font-bold leading-[1.1] tracking-tight text-white tablet:text-[48px]">
          Garanta sua vaga antes
          <br className="hidden tablet:block" /> da sua próxima viagem
        </h2>
        <p className="mx-auto mb-10 max-w-lg text-[17px] leading-relaxed text-white/70">
          Preço garantido, cancelamento grátis e voucher na hora. Sem filas, sem surpresas.
        </p>
        <button
          type="button"
          onClick={() => navigate("/search")}
          className="inline-flex items-center gap-2 rounded-full bg-white px-8 py-4 text-button-md font-semibold text-mp-navy transition-all hover:bg-mp-pale hover:gap-3"
        >
          Buscar vagas agora <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </section>
  );
}
