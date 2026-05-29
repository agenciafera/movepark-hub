import { ShieldCheck, Tag, BadgeCheck, Headphones } from "lucide-react";

const items = [
  {
    icon: ShieldCheck,
    title: "Cancelamento grátis",
    text: "Até 24h antes da reserva.",
  },
  {
    icon: Tag,
    title: "Preço travado",
    text: "Sem surpresas no balcão.",
  },
  {
    icon: BadgeCheck,
    title: "Operadoras verificadas",
    text: "Parceiros aprovados pela Movepark.",
  },
  {
    icon: Headphones,
    title: "Atendimento 24h",
    text: "Suporte por e-mail e telefone.",
  },
];

export function TrustBand() {
  return (
    <section className="bg-surface-soft">
      <div className="mx-auto grid w-full max-w-[1280px] grid-cols-1 gap-6 px-6 py-10 tablet:grid-cols-2 desktop:grid-cols-4 desktop:px-8">
        {items.map((it) => (
          <div key={it.title} className="flex items-start gap-3">
            <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-canvas text-mp-indigo shadow-tier">
              <it.icon className="h-5 w-5" />
            </span>
            <div className="flex flex-col">
              <span className="text-title-md text-ink">{it.title}</span>
              <span className="text-body-sm text-muted">{it.text}</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
