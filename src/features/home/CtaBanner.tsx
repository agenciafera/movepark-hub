import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { useGsapReveal } from "@/hooks/useGsapReveal";

export function CtaBanner() {
  const ref = useGsapReveal<HTMLElement>({ y: 32, duration: 0.75, start: "top 88%" });
  return (
    <section ref={ref} className="px-6 pt-4 pb-16 desktop:px-8 desktop:pb-20">
      <div className="relative mx-auto max-w-[1280px] overflow-hidden rounded-3xl">

        {/* Foto — posicionada à direita para mostrar a mulher */}
        <img
          src="/images/como-reservar.webp"
          alt=""
          aria-hidden="true"
          loading="lazy"
          decoding="async"
          className="absolute inset-0 h-full w-full object-cover object-[65%_center]"
        />

        {/* Tint violeta base sobre toda a imagem */}
        <div
          className="absolute inset-0"
          style={{ background: "rgba(38, 32, 98, 0.55)" }}
          aria-hidden="true"
        />

        {/* Gradiente da esquerda → transparente, para o texto ser legível */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(to right, rgba(20,15,60,0.72) 0%, rgba(20,15,60,0.50) 35%, rgba(20,15,60,0.20) 60%, transparent 80%)",
          }}
          aria-hidden="true"
        />

        {/* Conteúdo — alinhado à esquerda */}
        <div className="relative z-10 px-10 py-20 desktop:px-16 desktop:py-28">
          <p className="mb-4 text-caption-sm font-bold uppercase tracking-widest text-white/60">
            Reserve com antecedência
          </p>

          <h2
            className="mb-5 max-w-lg text-[38px] font-bold leading-[1.08] text-white tablet:text-[52px]"
            style={{ textWrap: "balance" } as React.CSSProperties}
          >
            Garanta sua vaga antes da sua próxima viagem
          </h2>

          <p className="mb-10 max-w-sm text-[16px] leading-relaxed text-white/70">
            Preço garantido, cancelamento grátis e voucher na hora. Sem filas, sem surpresas.
          </p>

          <Link
            to="/search"
            className="inline-flex items-center gap-2 rounded-full bg-mp-primary px-8 py-4 text-button-md font-semibold text-white transition-all hover:bg-mp-primary-active hover:gap-3"
          >
            Buscar estacionamento <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

      </div>
    </section>
  );
}
