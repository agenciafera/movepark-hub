import { Link } from "react-router-dom";
import { ArrowRight } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
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
          <p className="mb-4 text-badge uppercase tracking-[0.4px] text-white/70">
            Reserve com antecedência
          </p>

          <h2
            className="mb-5 max-w-lg text-display-2xl text-white"
            style={{ textWrap: "balance" } as React.CSSProperties}
          >
            Garanta sua vaga antes da sua próxima viagem
          </h2>

          <p className="mb-10 max-w-sm text-[16px] leading-relaxed text-white/70">
            Preço garantido, cancelamento grátis e voucher na hora. Sem filas, sem surpresas.
          </p>

          <Button asChild>
            <Link to="/search">
              Buscar estacionamento <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>

      </div>
    </section>
  );
}
