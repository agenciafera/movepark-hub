import { ShieldCheck, Tag, BadgeCheck, Headphones, CheckCircle, Lock, Star } from "lucide-react";
import type { LucideIcon } from "lucide-react";

// ---- Ilustrações por diferencial ----

function CancelIllustration() {
  return (
    <div aria-hidden className="mt-8 rounded-md border border-hairline bg-canvas p-4">
      <div className="flex items-center justify-between">
        <span className="text-[12px] font-semibold text-ink">Reserva #MP-1024</span>
        <span className="rounded-full bg-badge-cancelled-bg px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.3px] text-badge-cancelled-fg">
          Cancelada
        </span>
      </div>
      <div className="mt-3 flex items-center gap-2 rounded bg-badge-confirmed-bg px-3 py-2">
        <CheckCircle className="h-4 w-4 shrink-0 text-success" />
        <span className="text-[12px] font-medium text-success">Reembolso · R$ 48,00</span>
      </div>
    </div>
  );
}

function PriceIllustration() {
  return (
    <div aria-hidden className="mt-8 rounded-md border border-hairline bg-canvas p-4">
      <span className="text-[10px] font-bold uppercase tracking-[0.3px] text-muted">
        Valor da reserva
      </span>
      <div className="mt-1 flex items-baseline gap-1">
        <span className="text-[28px] font-bold leading-none text-ink">R$ 24</span>
        <span className="text-body-sm text-muted">/hora</span>
      </div>
      <div className="mt-3 flex items-center gap-1.5">
        <Lock className="h-3.5 w-3.5 text-mp-primary" />
        <span className="text-[12px] font-medium text-mp-primary">Preço garantido até a saída</span>
      </div>
    </div>
  );
}

function VerifiedIllustration() {
  return (
    <div aria-hidden className="mt-8 rounded-md border border-hairline bg-canvas p-4">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-mp-pale">
          <span className="text-[15px] font-black leading-none text-mp-indigo">P</span>
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-1">
            <span className="truncate text-[13px] font-semibold text-ink">Garagem Central</span>
            <BadgeCheck className="h-4 w-4 shrink-0 text-mp-primary" />
          </div>
          <div className="mt-0.5 flex items-center gap-1">
            <Star className="h-3 w-3 fill-mp-navy stroke-none" />
            <span className="text-[12px] text-muted">4.9 · 248 avaliações</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function SupportIllustration() {
  return (
    <div aria-hidden className="mt-8 space-y-2">
      <div className="max-w-[85%] rounded-xl rounded-tl-sm border border-hairline bg-canvas px-3 py-2.5 text-[12px] leading-relaxed text-ink">
        Meu voo atrasou. A vaga continua garantida?
      </div>
      <div className="ml-auto max-w-[85%] rounded-xl rounded-tr-sm bg-mp-primary px-3 py-2.5 text-[12px] leading-relaxed text-white">
        Sim! Sua vaga fica garantida por 3h após o horário previsto.
      </div>
    </div>
  );
}

// ---- Config dos cards ----

type Item = {
  icon: LucideIcon;
  title: string;
  text: string;
  Illustration: () => JSX.Element;
};

const items: Item[] = [
  {
    icon: ShieldCheck,
    title: "Cancelamento grátis",
    text: "Até 24h antes da reserva, sem custo.",
    Illustration: CancelIllustration,
  },
  {
    icon: Tag,
    title: "Preço travado",
    text: "Sem surpresas no balcão. O valor é o da reserva.",
    Illustration: PriceIllustration,
  },
  {
    icon: BadgeCheck,
    title: "Operadoras verificadas",
    text: "Parceiros aprovados e avaliados pela Movepark.",
    Illustration: VerifiedIllustration,
  },
  {
    icon: Headphones,
    title: "Atendimento 24h",
    text: "Suporte por e-mail e telefone antes e durante sua viagem.",
    Illustration: SupportIllustration,
  },
];

// ---- Componente ----

export function TrustBand() {
  return (
    <section className="px-6 py-16 desktop:px-8 desktop:py-24">
      <div className="mx-auto max-w-[1280px]">

        {/* Cabeçalho */}
        <div className="mb-12">
          <span className="text-[11px] font-bold uppercase tracking-[0.4px] text-muted-steel">
            Por que a Movepark
          </span>
          <h2 className="mt-3 max-w-2xl text-display-2xl text-ink">
            O que você tem em toda reserva
          </h2>
        </div>

        {/* Grid 2×2 */}
        <div className="grid grid-cols-1 gap-4 tablet:grid-cols-2 desktop:grid-cols-4">
          {items.map((it) => (
            <div
              key={it.title}
              className="overflow-hidden rounded-xl bg-surface-soft p-6 transition-shadow hover:shadow-tier"
            >
              <it.icon className="h-5 w-5 text-mp-primary" />
              <h3 className="mt-5 text-[18px] font-semibold leading-snug text-ink">{it.title}</h3>
              <p className="mt-2 max-w-sm text-body-sm text-muted">{it.text}</p>
              <it.Illustration />
            </div>
          ))}
        </div>

      </div>
    </section>
  );
}
