import { useGsapReveal } from "@/hooks/useGsapReveal";

const AVATAR_COLORS = [
  "bg-mp-violet text-white",
  "bg-mp-teal/40 text-mp-navy",
  "bg-mp-pale text-mp-indigo",
  "bg-mp-navy text-white",
];

function StarIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      className={filled ? "h-4 w-4 fill-yellow-400 text-yellow-400" : "h-4 w-4 fill-hairline text-hairline"}
      viewBox="0 0 20 20"
    >
      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
    </svg>
  );
}

function Stars({ rating }: { rating: number }) {
  return (
    <span className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <StarIcon key={n} filled={n <= rating} />
      ))}
    </span>
  );
}

function Avatar({ name, index }: { name: string; index: number }) {
  const color = AVATAR_COLORS[index % AVATAR_COLORS.length];
  return (
    <div
      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[15px] font-bold ${color}`}
    >
      {name.charAt(0)}
    </div>
  );
}

const reviews = [
  {
    name: "Fernanda Oliveira",
    destination: "GRU · Guarulhos",
    rating: 5,
    text: "Reservei a vaga com 3 dias de antecedência e foi tudo perfeito. O voucher chegou na hora e o check-in no estacionamento foi rápido.",
  },
  {
    name: "Carlos Mendes",
    destination: "CGH · Congonhas",
    rating: 5,
    text: "Comparei três estacionamentos e encontrei uma vaga coberta com valor bem abaixo do que pago normalmente. Recomendo muito.",
  },
  {
    name: "Ana Paula Costa",
    destination: "GIG · Galeão",
    rating: 4,
    text: "Processo super simples, reservei em menos de 2 minutos. Deixei o carro 10 dias e voltei sem estresse nenhum.",
  },
  {
    name: "Ricardo Santos",
    destination: "CNF · Confins",
    rating: 5,
    text: "Cancelamento gratuito até 24h antes salvou minha viagem quando o voo foi remarcado. Experiência sem dor de cabeça.",
  },
];

export function Testimonials() {
  const ref = useGsapReveal<HTMLElement>({ selector: "[data-reveal]", stagger: 0.09, y: 30, start: "top 88%" });
  return (
    <section ref={ref} className="bg-surface-soft py-16 desktop:py-20">
      <div className="mx-auto max-w-[1280px] px-6 desktop:px-8">
        <p data-reveal className="mb-2 text-caption-sm font-bold uppercase tracking-widest text-mp-violet">
          Avaliações verificadas
        </p>
        <h2 data-reveal className="mb-4 text-balance text-display-2xl text-ink">
          O que nossos clientes dizem
        </h2>

        {/* Stats agregados */}
        <div data-reveal className="mb-10 flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <Stars rating={5} />
            <span className="text-title-md font-bold text-ink">4.9</span>
          </div>
          <span className="text-muted-soft">·</span>
          <span className="text-body-sm text-muted">1.200+ avaliações verificadas</span>
        </div>

        <div className="grid grid-cols-1 gap-5 tablet:grid-cols-2 desktop:grid-cols-4">
          {reviews.map((r, i) => (
            <div
              key={r.name}
              data-reveal
              className="flex flex-col gap-4 rounded-xl border border-hairline bg-canvas p-5 shadow-tier"
            >
              {/* Avatar com inicial colorida */}
              <div className="flex items-center gap-3">
                <Avatar name={r.name} index={i} />
                <div>
                  <div className="text-caption font-semibold text-ink">{r.name}</div>
                  <div className="text-caption-sm text-muted">{r.destination}</div>
                </div>
              </div>

              <Stars rating={r.rating} />

              <p className="text-body-sm text-body leading-relaxed">&ldquo;{r.text}&rdquo;</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
