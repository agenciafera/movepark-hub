import { useRef, useEffect } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { gsap } from "@/lib/gsap";

const steps = [
  {
    title: "Escolha o destino",
    text: "Digite o aeroporto ou terminal e selecione as datas da sua viagem.",
  },
  {
    title: "Compare as opções",
    text: "Veja vagas de vários estacionamentos: coberto, descoberto, valet e mais.",
  },
  {
    title: "Reserve e pague online",
    text: "Pagamento seguro via PIX ou cartão. Confirmação instantânea.",
  },
  {
    title: "Apresente o voucher",
    text: "Chegue ao estacionamento e mostre o QR Code que enviamos por e-mail.",
  },
];

export function HowItWorks() {
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const ctx = gsap.context(() => {
      gsap.fromTo("[data-reveal='hw-header']", { opacity: 0, y: 22 },
        { opacity: 1, y: 0, duration: 0.6, ease: "power2.out", stagger: 0.09,
          scrollTrigger: { trigger: el, start: "top 88%", once: true } });
      gsap.fromTo("[data-reveal='hw-step']", { opacity: 0, y: 32 },
        { opacity: 1, y: 0, duration: 0.6, ease: "power2.out", stagger: 0.1,
          scrollTrigger: { trigger: el, start: "top 82%", once: true } });
      gsap.fromTo("[data-reveal='hw-image']", { opacity: 0, x: 40 },
        { opacity: 1, x: 0, duration: 0.8, ease: "power2.out",
          scrollTrigger: { trigger: el, start: "top 85%", once: true } });
    }, el);
    return () => ctx.revert();
  }, []);

  return (
    <section ref={sectionRef} className="bg-surface-soft py-16 desktop:py-20">
      <div className="mx-auto max-w-[1280px] px-6 desktop:px-8">
        <div className="grid grid-cols-1 gap-12 tablet:grid-cols-2 tablet:items-center">

          {/* Coluna esquerda: headline + descrição + grid 2×2 + link */}
          <div>
            <p data-reveal="hw-header" className="mb-2 text-caption-sm font-bold uppercase tracking-widest text-mp-violet">
              Simples e rápido
            </p>
            <h2 data-reveal="hw-header" className="mb-4 text-[36px] leading-[1.1] font-bold text-ink tablet:text-display-2xl">
              Como reservar em 4 passos
            </h2>
            <p data-reveal="hw-header" className="mb-10 max-w-md text-body-md text-muted">
              Do destino ao voucher em menos de 2 minutos. Sem cadastro obrigatório para buscar.
            </p>

            {/* Grid 2×2 — ordenação por coluna: 1,3 no topo / 2,4 embaixo */}
            <div className="grid grid-flow-col grid-cols-2 grid-rows-2 gap-x-10 gap-y-8">
              {steps.map((s, i) => (
                <div key={s.title} data-reveal="hw-step">
                  <span className="block text-[64px] font-black leading-none text-mp-navy">
                    {i + 1}
                  </span>
                  <h3 className="mt-2 text-title-md font-semibold text-ink">{s.title}</h3>
                  <p className="mt-1 text-body-sm text-muted">{s.text}</p>
                </div>
              ))}
            </div>

            <Link
              to="/search"
              className="group mt-10 inline-flex items-center gap-1.5 text-body-md font-semibold text-mp-violet"
            >
              Buscar vagas agora{" "}
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Link>
          </div>

          {/* Coluna direita: imagem full-height */}
          <div data-reveal="hw-image" className="relative min-h-[400px] overflow-hidden rounded-xl bg-surface-strong desktop:min-h-[560px]">
            <img
              src="/images/como-reservar.jpg"
              alt="Motorista sorrindo ao celular após concluir reserva no aeroporto"
              className="absolute inset-0 h-full w-full object-cover"
              loading="lazy"
              decoding="async"
            />

            {/* Floating booking card */}
            <div className="absolute bottom-8 left-8 rounded-lg border border-hairline bg-canvas px-4 py-3 shadow-tier">
              <div className="mb-1.5 text-caption font-bold text-ink">Reserva confirmada!</div>
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-success" />
                <span className="text-body-sm text-muted">Voucher enviado por e-mail</span>
              </div>
            </div>
          </div>

        </div>
      </div>
    </section>
  );
}
