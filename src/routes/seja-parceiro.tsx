import * as React from "react";
import { Helmet } from "react-helmet-async";
import {
  ArrowRight,
  Wallet,
  Megaphone,
  CreditCard,
  ShieldCheck,
  Tag,
  BadgeCheck,
  Play,
  Quote,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";
import { PartnerLeadModal } from "@/features/onboarding/PartnerLeadModal";

const HERO_IMAGE = "/Estacionamentos/movepark-virapark_001.jpg";

// Números do movepark.co/o-sistema (dados do negócio — confirmar/atualizar).
const METRICS = [
  { value: "R$ 1,28 mi", label: "gerado em reservas para parceiros" },
  { value: "125 mil+", label: "reservas já realizadas" },
  { value: "R$ 0", label: "de custo fixo mensal" },
  { value: "2 países", label: "Brasil e Portugal" },
];

const STEPS = [
  {
    n: 1,
    title: "Cadastro rápido",
    desc: "Deixe seu contato. Nossa equipe valida e configura seu estacionamento no sistema — sem burocracia.",
  },
  {
    n: 2,
    title: "Suas vagas no ar",
    desc: "Você aparece na busca. O cliente reserva e paga com antecedência, por PIX ou cartão, antes de chegar.",
  },
  {
    n: 3,
    title: "Dinheiro na conta",
    desc: "A Movepark garante o pagamento e faz o repasse organizado. Sem inadimplência, sem cobrança manual.",
  },
];

const BENEFITS = [
  {
    icon: Megaphone,
    title: "Marketing por nossa conta",
    desc: "Levamos clientes até você com tráfego pago e orgânico no Google. Você não gasta um real com mídia.",
  },
  {
    icon: Wallet,
    title: "Pagamento garantido",
    desc: "O cliente paga antes de chegar. Acabou a inadimplência e a cobrança no balcão.",
  },
  {
    icon: CreditCard,
    title: "PIX e cartão, checkout redondo",
    desc: "Reserva em poucos toques, com a melhor experiência de compra do setor.",
  },
  {
    icon: Tag,
    title: "Preço inteligente",
    desc: "Promoções sazonais, descontos por diária longa e cupons — você define, a gente ajuda na estratégia.",
  },
  {
    icon: BadgeCheck,
    title: "Sua marca em destaque",
    desc: "Seu estacionamento aparece verificado, com fotos, avaliações e reputação construída.",
  },
  {
    icon: ShieldCheck,
    title: "Seguro e sem risco",
    desc: "Dados protegidos (LGPD) e nenhum custo pra começar. Você só paga quando recebe uma reserva.",
  },
];

// Depoimentos ILUSTRATIVOS — trocar pelos reais dos donos de estacionamento.
const TESTIMONIALS = [
  {
    quote:
      "A ocupação nos dias de semana subiu de verdade. O cliente já chega pago, sem discussão no balcão.",
    name: "João P.",
    role: "Proprietário · Virapark",
  },
  {
    quote:
      "Entrei sem pagar nada e comecei a receber reserva na primeira semana. O repasse é organizado e certo.",
    name: "Marina R.",
    role: "Gerente · Garage Inn",
  },
  {
    quote:
      "O que mais pesou foi não gastar com marketing. Eles trazem o cliente e eu cuido só das vagas.",
    name: "Carlos A.",
    role: "Sócio · Nation Park",
  },
];

const BRANDS = ["Virapark", "Garage Inn", "Nation Park", "Aerovalet", "Abbapark", "Plenty Park"];

const FAQ = [
  {
    q: "Quanto custa para ser parceiro?",
    a: "Nada de custo fixo — sem mensalidade e sem taxa de adesão. A Movepark recebe uma comissão apenas quando você recebe uma reserva. Se você não ganha, a gente não ganha.",
  },
  {
    q: "Como eu recebo o dinheiro das reservas?",
    a: "O cliente paga com antecedência (PIX ou cartão). A Movepark garante o valor e faz o repasse organizado pra sua conta — sem inadimplência e sem cobrança manual.",
  },
  {
    q: "Preciso ter exclusividade com a Movepark?",
    a: "Não. Você continua vendendo pelos seus canais normalmente. A Movepark é mais um canal de reservas trabalhando a seu favor.",
  },
  {
    q: "Quanto tempo até entrar no ar?",
    a: "Depois do cadastro, nossa equipe valida as informações e configura seu estacionamento em poucos dias. Aí é só receber reservas.",
  },
  {
    q: "Eu continuo no controle dos preços?",
    a: "Sim. Você define a sua tabela. A Movepark ajuda com estratégia de preço — sazonalidade, promoções e descontos por diária longa.",
  },
  {
    q: "A Movepark investe em divulgação?",
    a: "Sim, e essa é a maior vantagem: levamos clientes por tráfego pago e orgânico no Google. Você aparece pra quem está buscando vaga, sem gastar com mídia.",
  },
];

function SejaParceiroCta({
  onClick,
  children,
  size = "default",
  variant = "primary",
}: {
  onClick: () => void;
  children: React.ReactNode;
  size?: "default" | "sm";
  variant?: "primary" | "secondary";
}) {
  return (
    <Button onClick={onClick} size={size} variant={variant}>
      {children}
      <ArrowRight className="h-4 w-4" />
    </Button>
  );
}

export default function SejaParceiroPage() {
  const [open, setOpen] = React.useState(false);
  const openModal = () => setOpen(true);

  return (
    <>
      <Helmet>
        <title>Seja parceiro | Movepark</title>
        <meta
          name="description"
          content="Coloque seu estacionamento na Movepark e receba reservas online com pagamento garantido. Sem mensalidade e sem custo de adesão — você só paga quando recebe uma reserva."
        />
      </Helmet>

      <PartnerLeadModal open={open} onOpenChange={setOpen} />

      {/* Hero — imagem em faixa, não muito alta */}
      <section className="relative isolate overflow-hidden bg-mp-navy">
        <img
          src={HERO_IMAGE}
          alt="Estacionamento parceiro Movepark"
          className="absolute inset-0 h-full w-full object-cover opacity-40"
        />
        <div className="absolute inset-0 bg-mp-navy/60" aria-hidden />
        <div className="relative mx-auto max-w-[1100px] px-4 py-14 text-white desktop:px-8 desktop:py-20">
          <span className="text-badge uppercase tracking-[0.4px] text-white/70">
            Para donos de estacionamento
          </span>
          <h1 className="mt-3 max-w-2xl text-display-2xl leading-tight text-white tablet:text-display-3xl">
            Encha suas vagas com reservas online — sem pagar nada de custo fixo.
          </h1>
          <p className="mt-4 max-w-xl text-body-md text-white/80">
            A Movepark leva clientes até o seu estacionamento e garante o pagamento. Você só paga
            quando recebe uma reserva. Simples assim.
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <SejaParceiroCta onClick={openModal}>Quero ser parceiro</SejaParceiroCta>
            <span className="text-caption-sm text-white/70">
              Leva 2 minutos · sem compromisso
            </span>
          </div>
        </div>
      </section>

      {/* Métricas */}
      <section className="border-b border-hairline bg-canvas">
        <div className="mx-auto grid max-w-[1100px] grid-cols-2 gap-6 px-4 py-8 desktop:grid-cols-4 desktop:px-8">
          {METRICS.map((m) => (
            <div key={m.label} className="text-center">
              <p className="text-display-xl text-ink">{m.value}</p>
              <p className="mt-1 text-body-sm text-muted">{m.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Custo zero — destaque */}
      <section className="mx-auto max-w-[1100px] px-4 py-16 desktop:px-8 desktop:py-20">
        <div className="rounded-lg border border-hairline bg-surface-pale p-8 text-center shadow-tier desktop:p-12">
          <p className="text-badge uppercase tracking-wide text-mp-indigo">Risco zero</p>
          <h2 className="mx-auto mt-3 max-w-2xl text-display-2xl text-ink">
            Você não paga nada de custo fixo.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-body-md text-muted">
            Sem mensalidade, sem taxa de adesão, sem gasto com marketing. A Movepark só ganha quando
            você recebe uma reserva — nossos interesses são exatamente os mesmos.
          </p>
          <div className="mt-7 flex justify-center">
            <SejaParceiroCta onClick={openModal}>Começar agora</SejaParceiroCta>
          </div>
        </div>
      </section>

      {/* Como funciona */}
      <section className="mx-auto max-w-[1100px] px-4 pb-16 desktop:px-8 desktop:pb-20">
        <h2 className="text-display-2xl text-ink">Como funciona</h2>
        <p className="mt-2 max-w-2xl text-body-md text-muted">
          Do cadastro ao repasse, a Movepark cuida da parte chata. Você cuida das vagas.
        </p>
        <ol className="mt-8 grid grid-cols-1 gap-8 tablet:grid-cols-3">
          {STEPS.map((s) => (
            <li key={s.n} className="flex flex-col gap-2">
              <span className="text-display-md tabular-nums text-mp-indigo">
                {String(s.n).padStart(2, "0")}
              </span>
              <div className="text-title-md text-ink">{s.title}</div>
              <p className="text-body-sm text-muted">{s.desc}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Benefícios */}
      <section className="border-y border-hairline bg-surface-soft">
        <div className="mx-auto max-w-[1100px] px-4 py-16 desktop:px-8 desktop:py-20">
          <h2 className="text-display-2xl text-ink">Por que colocar seu estacionamento aqui</h2>
          <div className="mt-8 grid grid-cols-1 gap-5 tablet:grid-cols-2 desktop:grid-cols-3">
            {BENEFITS.map((b) => (
              <div key={b.title} className="rounded-md border border-hairline bg-canvas p-6">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-mp-pale text-mp-indigo">
                  <b.icon className="h-5 w-5" />
                </span>
                <h3 className="mt-4 text-title-md text-ink">{b.title}</h3>
                <p className="mt-1.5 text-body-sm text-muted">{b.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Vídeo institucional */}
      <section className="mx-auto max-w-[900px] px-4 py-16 text-center desktop:px-8 desktop:py-20">
        <span className="inline-flex items-center gap-2 text-badge uppercase tracking-wide text-mp-indigo">
          <Play className="h-4 w-4" /> Conheça a Movepark
        </span>
        <h2 className="mx-auto mt-3 max-w-2xl text-display-xl text-ink">
          Veja como a Movepark trabalha pelo seu estacionamento
        </h2>
        <div className="mt-8 overflow-hidden rounded-lg border border-hairline shadow-tier">
          <div className="aspect-video">
            <iframe
              className="h-full w-full"
              src="https://www.youtube.com/embed/ZkbAd7B6CIo"
              title="Movepark — vídeo institucional"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              referrerPolicy="strict-origin-when-cross-origin"
              allowFullScreen
            />
          </div>
        </div>
      </section>

      {/* Depoimentos */}
      <section className="border-y border-hairline bg-surface-soft">
        <div className="mx-auto max-w-[1100px] px-4 py-16 desktop:px-8 desktop:py-20">
          <h2 className="text-display-2xl text-ink">Quem já é parceiro conta</h2>
          <div className="mt-8 grid grid-cols-1 gap-5 tablet:grid-cols-3">
            {TESTIMONIALS.map((t) => (
              <figure key={t.name} className="rounded-md border border-hairline bg-canvas p-6">
                <Quote className="h-6 w-6 text-mp-violet" />
                <blockquote className="mt-3 text-body-md text-ink">“{t.quote}”</blockquote>
                <figcaption className="mt-4 text-body-sm text-muted">
                  <span className="text-ink">{t.name}</span> · {t.role}
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      {/* Marcas */}
      <section className="mx-auto max-w-[1100px] px-4 py-14 text-center desktop:px-8">
        <p className="text-caption uppercase tracking-widest text-muted-steel">
          Estacionamentos que já são Movepark
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-x-10 gap-y-4">
          {BRANDS.map((b) => (
            <span key={b} className="text-title-md font-medium text-muted-steel">
              {b}
            </span>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section className="mx-auto max-w-[820px] px-4 pb-16 desktop:px-8 desktop:pb-20">
        <h2 className="text-display-2xl text-ink">Perguntas frequentes</h2>
        <div className="mt-6 rounded-lg border border-hairline bg-canvas px-6 shadow-tier">
          <Accordion type="single" collapsible>
            {FAQ.map((item, i) => (
              <AccordionItem key={i} value={`faq-${i}`}>
                <AccordionTrigger>{item.q}</AccordionTrigger>
                <AccordionContent>{item.a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>

      {/* CTA final */}
      <section className="bg-mp-navy">
        <div className="mx-auto max-w-[1100px] px-4 py-16 text-center text-white desktop:px-8 desktop:py-20">
          <h2 className="mx-auto max-w-2xl text-display-2xl text-white">
            Pronto pra encher suas vagas?
          </h2>
          <p className="mx-auto mt-3 max-w-lg text-body-md text-white/80">
            Cadastre seu estacionamento em 2 minutos. Sem custo pra começar.
          </p>
          <div className="mt-7 flex justify-center">
            <SejaParceiroCta onClick={openModal}>Quero ser parceiro</SejaParceiroCta>
          </div>
        </div>
      </section>
    </>
  );
}
