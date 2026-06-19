import { ShieldCheck, Tag, BadgeCheck, Headphones } from "lucide-react";

const items = [
  {
    icon: ShieldCheck,
    title: "Cancelamento grátis",
    text: "Até 24h antes da reserva, sem custo.",
  },
  {
    icon: Tag,
    title: "Preço travado",
    text: "Sem surpresas no balcão. O valor é o da reserva.",
  },
  {
    icon: BadgeCheck,
    title: "Operadoras verificadas",
    text: "Parceiros aprovados e avaliados pela Movepark.",
  },
  {
    icon: Headphones,
    title: "Atendimento 24h",
    text: "Suporte por e-mail e telefone antes e durante sua viagem.",
  },
];

export function TrustBand() {
  return (
    <section className="border-y border-hairline py-14">
      <div className="mx-auto max-w-[1280px] px-6 desktop:px-8">
        <div className="grid grid-cols-1 gap-8 tablet:grid-cols-2 desktop:grid-cols-4">
          {items.map((it) => (
            <div key={it.title} className="flex flex-col gap-3">
              <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-mp-pale text-mp-indigo">
                <it.icon className="h-6 w-6" />
              </span>
              <div>
                <div className="text-title-md text-ink">{it.title}</div>
                <p className="mt-1 text-body-sm text-muted">{it.text}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
