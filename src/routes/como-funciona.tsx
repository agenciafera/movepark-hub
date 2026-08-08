import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { CalendarCheck, Car, Clock, MagnifyingGlass, MapPin, QrCode, ShieldCheck } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/PageHeader";

const STEPS = [
  {
    icon: MagnifyingGlass,
    n: "01",
    title: "Busque sua vaga",
    desc: "Informe seu destino (aeroporto ou terminal) e as datas de entrada e saída. Em segundos, você vê todos os estacionamentos parceiros disponíveis na região, com preços e distâncias.",
  },
  {
    icon: CalendarCheck,
    n: "02",
    title: "Reserve em 2 minutos",
    desc: "Escolha o estacionamento ideal e finalize o pagamento por PIX ou cartão de crédito. Preço fixo: o valor exibido é o que você paga. Sem surpresas na saída.",
  },
  {
    icon: Car,
    n: "03",
    title: "Chegue e estacione",
    desc: "No dia combinado, vá diretamente ao estacionamento. Não precisa ligar antes nem esperar fila: sua vaga já está reservada e confirmada.",
  },
  {
    icon: QrCode,
    n: "04",
    title: "Faça check-in pelo QR Code",
    desc: "Apresente o voucher digital (QR Code) enviado por e-mail na entrada do estacionamento. O processo leva segundos. Pode partir tranquilo pro aeroporto.",
  },
];

const BENEFITS = [
  { icon: ShieldCheck, title: "Parceiros certificados", desc: "Todo estacionamento na plataforma passou pela avaliação da Movepark." },
  { icon: Clock, title: "Preço fixo garantido", desc: "O valor da reserva não muda. Sem cobrança extra na saída." },
  { icon: MapPin, title: "Próximos ao seu destino", desc: "Filtramos por proximidade ao aeroporto ou terminal que você precisa." },
];

const FAQ_FUNC = [
  {
    q: "Preciso imprimir o voucher?",
    a: "Não. O QR Code no celular é suficiente. Mas você pode imprimir se preferir.",
  },
  {
    q: "E se eu precisar ficar mais tempo do que o reservado?",
    a: "Fale com o estacionamento no local. A Movepark vai ajustar o pagamento da diferença, se aplicável.",
  },
  {
    q: "Posso cancelar se mudar de planos?",
    a: "Sim. Dentro do prazo da sua Tarifa o reembolso é integral: 24 horas antes do check-in na Básica e na Flex, ou até 1 minuto antes na Superflex. Em unidades que fecham a reserva no site do parceiro, valem as condições dele. Veja a Política de Cancelamento.",
  },
];

export default function ComoFuncionaPage() {
  return (
    <>
      <Helmet>
        <title>Como Funciona | Movepark</title>
        <meta
          name="description"
          content="Entenda como a Movepark funciona: busque, reserve online, chegue ao estacionamento e faça check-in com QR Code. Simples assim."
        />
        <meta property="og:title" content="Como Funciona | Movepark" />
        <meta property="og:url" content="https://hub.movepark.co/como-funciona" />
        <link rel="canonical" href="https://hub.movepark.co/como-funciona" />
      </Helmet>

      <div className="mx-auto w-full max-w-[1080px] px-4 py-12 desktop:px-8">
        <PageHeader
          variant="content"
          className="mb-16 max-w-2xl"
          title="Reserve sua vaga em menos de 2 minutos."
          description="Da busca ao check-in, tudo pelo celular. Sem ligação, sem fila, sem estresse."
        />

        {/* Passo a passo */}
        <section className="mb-16">
          <h2 className="mb-8 text-display-sm text-ink">Passo a passo</h2>
          <div className="relative space-y-0">
            {STEPS.map((step, i) => (
              <div key={step.n} className="relative flex gap-6 pb-12 last:pb-0">
                {/* Linha vertical */}
                {i < STEPS.length - 1 && (
                  <div className="absolute left-[19px] top-10 h-full w-px bg-hairline" />
                )}
                {/* Ícone (mesmo tratamento dos cards de benefício: pale + indigo) */}
                <div className="relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-mp-pale text-mp-indigo">
                  <step.icon className="h-5 w-5" />
                </div>
                {/* Conteúdo */}
                <div className="pt-1">
                  <div className="mb-0.5 text-badge uppercase tracking-[0.4px] text-muted">
                    Passo {step.n}
                  </div>
                  <h3 className="text-title-md text-ink">{step.title}</h3>
                  <p className="mt-2 max-w-lg text-body-md text-body">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Benefícios */}
        <section className="mb-16">
          <h2 className="mb-8 text-display-sm text-ink">Por que usar a Movepark?</h2>
          <div className="grid grid-cols-1 gap-6 tablet:grid-cols-3">
            {BENEFITS.map((b) => (
              <div key={b.title} className="rounded-md border border-hairline bg-canvas p-6">
                <span className="mb-4 flex h-10 w-10 items-center justify-center rounded-sm bg-mp-pale text-mp-indigo">
                  <b.icon className="h-5 w-5" />
                </span>
                <h3 className="text-title-sm text-ink">{b.title}</h3>
                <p className="mt-1 text-body-sm text-muted">{b.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Dúvidas rápidas */}
        <section className="mb-16">
          <h2 className="mb-6 text-display-sm text-ink">Dúvidas rápidas</h2>
          <div className="space-y-6">
            {FAQ_FUNC.map((item) => (
              <div key={item.q}>
                <h3 className="text-title-sm text-ink">{item.q}</h3>
                <p className="mt-1 text-body-sm text-body">{item.a}</p>
              </div>
            ))}
          </div>
          <div className="mt-6">
            <Link to="/faq" className="text-body-sm font-medium text-mp-indigo hover:underline">
              Ver todas as dúvidas →
            </Link>
          </div>
        </section>

        {/* CTA */}
        <section className="rounded-md bg-mp-pale px-8 py-10 text-center">
          <h2 className="mb-2 text-display-sm text-ink">Pronto para reservar?</h2>
          <p className="mx-auto mb-6 max-w-md text-body-md text-body">
            Encontre sua vaga e garanta tranquilidade na próxima viagem.
          </p>
          <Button asChild>
            <Link to="/">Buscar estacionamento</Link>
          </Button>
        </section>
      </div>
    </>
  );
}
