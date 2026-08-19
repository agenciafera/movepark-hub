import { Link } from "react-router-dom";
import { ArrowRight } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { useGsapReveal } from "@/hooks/useGsapReveal";
import { cn } from "@/lib/utils";

/**
 * Banner de fechamento do consumer. Nasceu na home e virou o padrão em 18/08/2026:
 * a /como-funciona e a /sobre fechavam com um card próprio (navy com dois botões,
 * e `mp-pale` centralizado) dizendo praticamente a mesma coisa em três desenhos.
 *
 * A única variação permitida é a largura do container, porque ela é função da
 * página e não do banner: a home é `app` (1280) e as páginas de conteúdo são
 * `conteudo` (1080). Ver a skill `harmonizar-paginas`.
 */
type Largura = "app" | "conteudo";

const CONTAINER: Record<Largura, string> = {
  app: "max-w-[1280px]",
  conteudo: "max-w-[1080px]",
};

/** A calha acompanha a da página: a home respira 24px no mobile, o conteúdo 16px. */
const CALHA: Record<Largura, string> = {
  app: "px-6 desktop:px-8",
  conteudo: "px-4 desktop:px-8",
};

export function CtaBanner({ largura = "app" }: { largura?: Largura }) {
  const ref = useGsapReveal<HTMLElement>({ y: 32, duration: 0.75, start: "top 88%" });
  return (
    <section ref={ref} className={cn("pt-4 pb-16 desktop:pb-20", CALHA[largura])}>
      <div className={cn("relative mx-auto overflow-hidden rounded-3xl", CONTAINER[largura])}>
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

          <p className="mb-10 max-w-sm text-pretty text-body-md text-white/70">
            Compare estacionamentos parceiros perto do seu embarque e siga direto para a reserva.
            Sem taxa da Movepark.
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
