import { useNavigate } from "react-router-dom";
import { ArrowRight } from "lucide-react";

const trustItems = ["Confirmação imediata", "Sem taxa de serviço", "Cancelamento grátis"];

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

export function CtaBanner() {
  const navigate = useNavigate();
  return (
    <section className="relative overflow-hidden">
      {/* Fundo navy */}
      <div className="absolute inset-0 bg-mp-navy" aria-hidden="true" />
      {/* Grid pattern sutil */}
      <div
        className="absolute inset-0 opacity-[0.035]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
        }}
        aria-hidden="true"
      />
      {/* Gradiente radial de acento */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at 70% 50%, hsl(239 82% 65% / 0.35) 0%, transparent 65%)",
        }}
        aria-hidden="true"
      />

      <div className="relative z-10 mx-auto max-w-[1280px] px-6 py-20 text-center desktop:px-8 desktop:py-28">
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
        <button
          type="button"
          onClick={() => navigate("/search")}
          className="inline-flex items-center gap-2 rounded-full bg-white px-8 py-4 text-button-md font-semibold text-mp-navy transition-all hover:bg-mp-pale hover:gap-3"
        >
          Buscar vagas agora <ArrowRight className="h-4 w-4" />
        </button>

        {/* Trust pills abaixo do CTA */}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
          {trustItems.map((label) => (
            <span key={label} className="inline-flex items-center gap-1.5 text-[13px] text-white/60">
              <CheckIcon />
              {label}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
