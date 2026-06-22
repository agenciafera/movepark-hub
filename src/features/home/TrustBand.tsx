import { ShieldCheck, Tag, BadgeCheck, Headphones, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

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
    <section className="px-6 py-12 desktop:px-8 desktop:py-16">
      <div className="mx-auto max-w-[1280px]">
        <div className="overflow-hidden rounded-[20px] bg-brand-gradient">
          <div className="grid grid-cols-1 desktop:grid-cols-[1fr_340px]">

            {/* Coluna esquerda — conteúdo */}
            <div className="flex flex-col px-8 py-12 desktop:px-14 desktop:py-14">
              <span className="text-[11px] font-bold uppercase tracking-[0.4px] text-white/60">
                Por que a Movepark
              </span>

              <h2 className="mt-3 max-w-xl text-[32px] font-bold leading-[1.15] tracking-[-0.4px] text-white tablet:text-[40px]">
                Estacione com confiança e tranquilidade
              </h2>

              <p className="mt-4 max-w-lg text-body-md text-white/75">
                Reserve com segurança: preço garantido, cancelamento flexível e
                parceiros verificados em todos os destinos.
              </p>

              <div className="mt-10 grid grid-cols-1 gap-x-10 gap-y-8 tablet:grid-cols-2">
                {items.map((it) => (
                  <div key={it.title} className="flex flex-col gap-3">
                    <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/15">
                      <it.icon className="h-5 w-5 text-white" />
                    </span>
                    <div>
                      <p className="text-title-md text-white">{it.title}</p>
                      <p className="mt-1 text-body-sm text-white/70">{it.text}</p>
                    </div>
                  </div>
                ))}
              </div>

              <a
                href="/como-funciona"
                className="mt-10 inline-flex items-center gap-1.5 text-body-sm font-medium text-white underline underline-offset-4 hover:text-white/80"
              >
                Saiba mais <ArrowRight className="h-4 w-4" />
              </a>
            </div>

            {/* Coluna direita — imagem + CTA (oculta em mobile) */}
            <div className="hidden flex-col gap-6 px-8 pb-12 pt-10 desktop:flex desktop:px-8 desktop:pb-14">
              <div className="min-h-0 flex-1 overflow-hidden rounded-xl">
                <img
                  src="/images/como-reservar.jpg"
                  alt="Como reservar no Movepark"
                  className="h-full w-full object-cover object-center"
                />
              </div>
              <Button
                asChild
                className="w-full shrink-0 bg-white !text-mp-navy hover:bg-mp-pale"
              >
                <a href="/search">Reservar agora</a>
              </Button>
            </div>

          </div>
        </div>
      </div>
    </section>
  );
}
