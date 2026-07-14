import { useRef, useEffect } from "react";
import { Link } from "react-router-dom";
import { MapPin, LayoutList, CreditCard, Ticket, Heart, Share2, CheckCircle, ArrowRight, Star, ShieldCheck } from "lucide-react";
import { gsap } from "@/lib/gsap";

const steps = [
  {
    Icon: MapPin,
    title: "Escolha o destino",
    text: "Digite o aeroporto ou terminal e selecione as datas da sua viagem.",
  },
  {
    Icon: LayoutList,
    title: "Compare as opções",
    text: "Veja vagas de vários estacionamentos: coberto, descoberto, valet e mais.",
  },
  {
    Icon: CreditCard,
    title: "Reserve e pague online",
    text: "Pagamento seguro via PIX ou cartão. Confirmação instantânea.",
  },
  {
    Icon: Ticket,
    title: "Apresente o voucher",
    text: "Chegue ao estacionamento e mostre o QR Code que enviamos por e-mail.",
  },
];

function BookingCardMockup() {
  return (
    <div className="relative flex items-center justify-center px-10 py-16">
      <style>{`
        @keyframes hw-float-a {
          0%, 100% { transform: translateY(0px) rotate(-1deg); }
          50%       { transform: translateY(-10px) rotate(-1deg); }
        }
        @keyframes hw-float-b {
          0%, 100% { transform: translateY(0px) rotate(1.5deg); }
          50%       { transform: translateY(-8px) rotate(1.5deg); }
        }
        @keyframes hw-float-c {
          0%, 100% { transform: translateY(0px) rotate(-0.5deg); }
          50%       { transform: translateY(-12px) rotate(-0.5deg); }
        }
        .hw-float-a { animation: hw-float-a 3.2s ease-in-out infinite; }
        .hw-float-b { animation: hw-float-b 3.8s ease-in-out 0.6s infinite; }
        .hw-float-c { animation: hw-float-c 4.4s ease-in-out 1.2s infinite; }
      `}</style>

      {/* Glow violeta atrás do card */}
      <div
        className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
        style={{
          width: "400px", height: "400px", borderRadius: "50%",
          background: "radial-gradient(circle, hsla(239, 70%, 65%, 0.18) 0%, transparent 70%)",
          filter: "blur(40px)",
        }}
        aria-hidden="true"
      />

      {/* Popup 1 — esquerda: pagamento aprovado */}
      <div className="hw-float-a pointer-events-none absolute -left-2 top-24 z-10">
        <div className="flex items-center gap-2.5 rounded-2xl border border-hairline bg-canvas px-3.5 py-2.5 shadow-tier">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-success/12">
            <CheckCircle className="h-4 w-4 text-success" aria-hidden />
          </div>
          <div>
            <p className="text-[12px] font-semibold text-ink">Pagamento confirmado</p>
            <p className="text-[11px] text-muted">via PIX</p>
          </div>
        </div>
      </div>

      {/* Popup 2 — topo direito: avaliação */}
      <div className="hw-float-b pointer-events-none absolute -right-4 top-14 z-10">
        <div className="flex items-center gap-2 rounded-2xl border border-hairline bg-canvas px-3.5 py-2.5 shadow-tier">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-yellow-400/15">
            <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" aria-hidden />
          </div>
          <div>
            <p className="text-[12px] font-semibold text-ink">4.8 · Excelente</p>
            <p className="text-[11px] text-muted">127 avaliações</p>
          </div>
        </div>
      </div>

      {/* Popup 3 — baixo direito: vaga segura */}
      <div className="hw-float-a pointer-events-none absolute -right-2 bottom-6 z-10" style={{ animationDelay: "1.8s" }}>
        <div className="flex items-center gap-2 rounded-2xl border border-hairline bg-canvas px-3.5 py-2.5 shadow-tier">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-mp-pale">
            <ShieldCheck className="h-4 w-4 text-mp-indigo" aria-hidden />
          </div>
          <div>
            <p className="text-[12px] font-semibold text-ink">Vaga garantida</p>
            <p className="text-[11px] text-muted">Cancelamento grátis</p>
          </div>
        </div>
      </div>

      {/* Card principal — maior */}
      <div className="relative w-full max-w-[370px] overflow-hidden rounded-2xl border border-hairline bg-canvas shadow-tier">
        {/* Foto do estacionamento */}
        <div className="relative aspect-[16/8] overflow-hidden bg-surface-strong">
          <img
            src="/Estacionamentos/vaga-coberta-estacionamento-aeroporto-guarulhos-aeroparking.webp"
            alt=""
            aria-hidden="true"
            className="h-full w-full object-cover"
            loading="lazy"
            decoding="async"
          />
        </div>

        {/* Conteúdo do card */}
        <div className="p-5">
          <p className="text-[13px] font-semibold text-muted">Reserva #000234</p>
          <p className="mt-0.5 text-[17px] font-bold text-ink">Estacionamento Coberto</p>

          {/* Datas */}
          <div className="mt-4 flex items-center gap-2 rounded-xl bg-surface-soft px-3 py-3">
            <div className="min-w-0 flex-1 text-center">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">Entrada</p>
              <p className="text-[14px] font-semibold text-ink">28 jun · 12:00</p>
            </div>
            <div className="h-7 w-px bg-hairline" />
            <div className="min-w-0 flex-1 text-center">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">Saída</p>
              <p className="text-[14px] font-semibold text-ink">30 jun · 12:00</p>
            </div>
          </div>

          {/* Ações */}
          <div className="mt-4 flex items-center gap-2">
            <button type="button" aria-label="Salvar"
              className="flex h-9 w-9 items-center justify-center rounded-full border border-hairline text-muted hover:text-mp-red">
              <Heart className="h-4 w-4" aria-hidden />
            </button>
            <button type="button" aria-label="Compartilhar"
              className="flex h-9 w-9 items-center justify-center rounded-full border border-hairline text-muted hover:text-mp-indigo">
              <Share2 className="h-4 w-4" aria-hidden />
            </button>
            <button type="button" aria-label="Ver no mapa"
              className="flex h-9 w-9 items-center justify-center rounded-full border border-hairline text-muted hover:text-mp-indigo">
              <MapPin className="h-4 w-4" aria-hidden />
            </button>

            <div className="ml-auto flex items-center gap-1.5 rounded-full bg-badge-confirmed-bg px-3 py-1.5">
              <CheckCircle className="h-3.5 w-3.5 shrink-0 text-success" aria-hidden />
              <span className="text-[12px] font-semibold text-success">Reserva concluída</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function HowItWorks() {
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const ctx = gsap.context(() => {
      gsap.fromTo("[data-reveal='hw-header']", { opacity: 0, y: 22 },
        { opacity: 1, y: 0, duration: 0.6, ease: "power2.out", stagger: 0.09,
          scrollTrigger: { trigger: el, start: "top 88%", once: true } });
      gsap.fromTo("[data-reveal='hw-step']", { opacity: 0, x: -24 },
        { opacity: 1, x: 0, duration: 0.55, ease: "power2.out", stagger: 0.1,
          scrollTrigger: { trigger: el, start: "top 82%", once: true } });
      gsap.fromTo("[data-reveal='hw-card']", { opacity: 0, x: 32, scale: 0.97 },
        { opacity: 1, x: 0, scale: 1, duration: 0.8, ease: "power2.out",
          scrollTrigger: { trigger: el, start: "top 80%", once: true } });
    }, el);
    return () => ctx.revert();
  }, []);

  return (
    <section ref={sectionRef} className="bg-surface-soft py-16 desktop:py-24">
      <div className="mx-auto max-w-[1280px] px-6 desktop:px-8">
        <div className="grid grid-cols-1 gap-12 tablet:grid-cols-2 tablet:items-center">

          {/* Coluna esquerda: headline + passos verticais */}
          <div>
            <p data-reveal="hw-header" className="mb-2 text-caption-sm font-bold uppercase tracking-widest text-mp-violet">
              Simples e rápido
            </p>
            <h2 data-reveal="hw-header" className="mb-3 text-[36px] leading-[1.1] font-bold text-ink tablet:text-display-2xl" style={{ textWrap: "balance" } as React.CSSProperties}>
              Reserve sua vaga de estacionamento em quatro passos fáceis
            </h2>
            <p data-reveal="hw-header" className="mb-10 max-w-md text-body-md text-muted">
              Do destino ao voucher em menos de 2 minutos.
            </p>

            {/* Lista vertical de passos */}
            <ol className="flex flex-col gap-6">
              {steps.map((s) => (
                <li
                  key={s.title}
                  data-reveal="hw-step"
                  className="flex items-start gap-4"
                >
                  {/* Ícone numerado */}
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-mp-pale">
                    <s.Icon className="h-[18px] w-[18px] text-mp-indigo" aria-hidden />
                  </div>
                  <div className="pt-1">
                    <div className="flex items-center gap-2">
                      <h3 className="text-title-md text-ink">{s.title}</h3>
                    </div>
                    <p className="mt-1 text-body-sm text-muted">{s.text}</p>
                  </div>
                </li>
              ))}
            </ol>

            <Link
              to="/search"
              className="mt-10 inline-flex items-center gap-2 rounded-full bg-mp-primary px-6 py-3 text-button-sm font-semibold text-white transition-colors hover:bg-mp-primary-active"
            >
              Buscar estacionamento <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          {/* Coluna direita: card de reserva confirmada */}
          <div data-reveal="hw-card">
            <BookingCardMockup />
          </div>

        </div>
      </div>
    </section>
  );
}
