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
  Quote,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { FaqList } from "@/features/faqs/FaqList";
import type { FaqCombinedItem } from "@/features/faqs/api";
import { PartnerLeadModal } from "@/features/onboarding/PartnerLeadModal";
import { PartnerLogos } from "@/features/partners/PartnerLogos";

const HERO_IMAGE = "/images/seja-parceiro-acordo.webp";

// Sinais de confiança: fatos da política do parceiro, sem número sem lastro.
const METRICS = [
  { value: "R$ 0", label: "de custo pra começar" },
  { value: "100%", label: "das reservas pagas com antecedência" },
  { value: "PIX & cartão", label: "o cliente paga antes de chegar" },
  { value: "Sem trava", label: "você segue vendendo do seu jeito" },
];

const STEPS = [
  {
    n: 1,
    title: "Cadastro rápido",
    desc: "Deixe seu contato. Nossa equipe valida e configura seu estacionamento no sistema, sem burocracia.",
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

const PAINS = [
  "Ocupação baixa em dia de semana, com o custo fixo correndo igual.",
  "Cliente que some na hora de pagar e discussão de preço no balcão.",
  "Dinheiro em anúncio sem saber se volta em reserva.",
  "Vaga parada hoje é receita que não volta amanhã.",
];

/**
 * `featured` marca os dois argumentos que mais pesam pra quem tem estacionamento:
 * não gastar com mídia e não levar calote. Eles ganham tile grande no bento; os
 * outros quatro ficam compactos. Seis cards idênticos comunicariam que todo
 * benefício vale o mesmo, que é justamente o contrário do que a gente quer dizer.
 */
const BENEFITS = [
  {
    icon: Megaphone,
    featured: true,
    title: "Marketing por nossa conta",
    desc: "Levamos clientes até você com tráfego pago e orgânico no Google. Você não gasta um real com mídia.",
  },
  {
    icon: Wallet,
    featured: true,
    title: "Pagamento garantido",
    desc: "O cliente paga antes de chegar. Acabou a inadimplência e a discussão no balcão.",
  },
  {
    icon: CreditCard,
    title: "PIX e cartão, checkout redondo",
    desc: "Reserva em poucos toques, com pagamento aprovado na hora.",
  },
  {
    icon: Tag,
    title: "Preço no seu controle",
    desc: "Você define a tabela. A gente ajuda com estratégia: sazonalidade, promoções e desconto por diária longa.",
  },
  {
    icon: BadgeCheck,
    title: "Sua marca em destaque",
    desc: "Seu estacionamento aparece verificado, com fotos, avaliações e reputação construída.",
  },
  {
    icon: ShieldCheck,
    title: "Seguro e sem risco",
    desc: "Dados protegidos (LGPD) e zero custo pra entrar. Você testa sem colocar nada em risco.",
  },
];

// Depoimentos ILUSTRATIVOS: trocar pelos reais dos donos de estacionamento.
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

const FAQ = [
  {
    q: "Quanto custa para ser parceiro?",
    a: "Começar não custa nada: sem mensalidade e sem taxa de adesão. Os detalhes comerciais a gente alinha direto com você, já com as reservas na mesa.",
  },
  {
    q: "Como eu recebo o dinheiro das reservas?",
    a: "O cliente paga com antecedência (PIX ou cartão). A Movepark garante o valor e faz o repasse organizado pra sua conta, sem inadimplência e sem cobrança manual.",
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
    a: "Sim. Você define a sua tabela. A Movepark ajuda com estratégia de preço: sazonalidade, promoções e desconto por diária longa.",
  },
  {
    q: "A Movepark investe em divulgação?",
    a: "Sim, e essa é a maior vantagem: tráfego pago e orgânico no Google trazem quem está buscando vaga até você, sem você gastar um real com mídia.",
  },
];

// Adapta a FAQ estática do parceiro ao shape do FaqList (componente único de FAQ do projeto).
const FAQ_ITEMS: FaqCombinedItem[] = FAQ.map((f, i) => ({
  id: `parceiro-${i}`,
  scope: "global",
  location_id: null,
  destination_id: null,
  question: f.q,
  answer: f.a,
  sort_order: i,
  category: null,
}));

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
          content="Coloque seu estacionamento na Movepark e receba reservas online com pagamento garantido. Sem mensalidade e sem custo de adesão para começar."
        />
      </Helmet>

      <PartnerLeadModal open={open} onOpenChange={setOpen} />

      {/* Hero: imagem em faixa, não muito alta */}
      <section className="relative isolate overflow-hidden bg-mp-navy">
        <img
          src={HERO_IMAGE}
          alt="Estacionamento parceiro Movepark"
          fetchPriority="high"
          decoding="async"
          className="absolute inset-0 h-full w-full object-cover"
        />
        {/* Overlay chapado. A foto foi feita pra isso: a metade esquerda é parede
            em sombra de cima a baixo, sem céu, então 30% já dá o piso do texto sem
            precisar apagar a cena. Com a foto anterior (contraluz, céu estourado na
            esquerda) nem 65% chapado passava, e era preciso degradê. */}
        <div className="absolute inset-0 bg-mp-navy/30" aria-hidden />
        <div className="relative mx-auto max-w-[1100px] px-4 py-20 text-white desktop:px-8 desktop:py-28">
          <span className="text-badge uppercase tracking-[0.4px] text-white/70">
            Para donos de estacionamento
          </span>
          {/* `max-w-xl` e nao `2xl`: a 672px a ponta direita do h1 caia sobre o homem
              iluminado e o contraste ia a 2,2:1. A 576px ele fica na parede escura. */}
          <h1 className="mt-3 max-w-xl text-balance text-display-3xl text-white">
            Encha suas vagas com reservas online. Sem custo pra começar.
          </h1>
          <p className="mt-4 max-w-xl text-body-md text-white/80">
            A Movepark leva clientes até o seu estacionamento e garante o pagamento adiantado. Sem
            mensalidade, sem risco pra começar.
          </p>
          <div className="mt-7 flex flex-col items-start gap-2.5">
            <SejaParceiroCta onClick={openModal}>Quero ser parceiro</SejaParceiroCta>
            <span className="text-caption-sm text-white/70">
              Leva 2 minutos · sem compromisso
            </span>
          </div>
        </div>
      </section>

      {/* Dor e resposta, lado a lado. Antes eram duas seções soltas em pontos
          diferentes da página; juntas, uma lê a outra: à esquerda o problema como
          papelada torta, à direita a fatura que zera o custo.

          A cor está invertida em relação ao mockup de propósito: não existe lilás nos
          tokens (`surface-pale` é alias do `mp-pale`), e pôr o azul da marca no lado da
          resposta, deixando o problema em cinza neutro, diz a coisa certa. */}
      <section className="mx-auto max-w-[1100px] px-4 py-16 desktop:px-8 desktop:py-20">
        <div className="grid grid-cols-1 items-stretch gap-6 tablet:grid-cols-2">
          {/* Card da dor */}
          <div className="flex flex-col rounded-xl bg-surface-soft p-8 desktop:p-10">
            <span className="text-badge uppercase tracking-wide text-mp-indigo">
              A rotina de quem tem estacionamento
            </span>
            <h2 className="mt-3 text-balance text-display-2xl text-ink">Vaga vazia não volta.</h2>
            <p className="mt-4 text-body-md text-body">O que trava a sua receita todo mês.</p>

            {/* A pilha de comprovantes. Cada um é levemente girado e puxado pra cima do
                anterior; o recorte tracejado e o X vermelho fazem a leitura de "papelada
                de problema" sem precisar escrever a palavra em cada um. */}
            <ul className="relative mt-10 flex-1">
              {PAINS.map((p, i) => (
                <li
                  key={p}
                  className="rounded-md border border-hairline bg-canvas px-5 pb-9 pt-5 shadow-tier"
                  style={{
                    transform: `rotate(${[-2.5, 1.5, -1, 2][i] ?? 0}deg)`,
                    marginTop: i === 0 ? 0 : -20,
                    position: "relative",
                    zIndex: i + 1,
                  }}
                >
                  <div className="flex items-center gap-2">
                    <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-sm bg-mp-red text-white">
                      <X className="h-4 w-4" aria-hidden />
                    </span>
                    <span className="h-px flex-1 border-t border-dashed border-hairline" />
                  </div>
                  <p className="mt-3 text-body-sm text-ink">{p}</p>
                </li>
              ))}
            </ul>
          </div>

          {/* Card da resposta */}
          <div className="flex flex-col rounded-xl bg-mp-pale p-8 desktop:p-10">
            <span className="text-badge uppercase tracking-wide text-mp-indigo">Risco zero</span>
            <h2 className="mt-3 text-balance text-display-2xl text-ink">
              Você cuida das vagas, a gente cuida do resto.
            </h2>
            <p className="mt-4 text-body-md text-body">
              A Movepark traz o cliente, recebe adiantado e repassa organizado.
            </p>

            {/* A fatura zerada. É a prova literal do "sem botar nada do bolso": as três
                linhas que o parceiro teme, todas em zero, e o total fechando em zero. */}
            <div className="mt-10 flex-1">
              <div className="rounded-md bg-canvas p-6">
                <p className="text-badge uppercase tracking-wide text-muted">Custo pra começar</p>
                <dl className="mt-5 space-y-3">
                  {[
                    "Mensalidade",
                    "Taxa de adesão",
                    "Anúncio e mídia",
                  ].map((linha) => (
                    <div key={linha} className="flex items-baseline justify-between gap-4">
                      <dt className="text-body-sm text-body">{linha}</dt>
                      <dd className="text-body-sm tabular-nums text-body">R$ 0,00</dd>
                    </div>
                  ))}
                </dl>
                <div className="mt-5 border-t border-hairline pt-5">
                  <div className="flex items-baseline justify-between gap-4">
                    <span className="text-title-md text-ink">Você paga</span>
                    <span className="text-display-sm tabular-nums text-ink">R$ 0,00</span>
                  </div>
                </div>
              </div>

              <div className="mt-6">
                <SejaParceiroCta onClick={openModal}>Começar agora</SejaParceiroCta>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Sinais de confiança, em bento.
          Eram quatro textos centralizados iguais numa fileira, que é o formato mais
          chapado que existe: nada puxa o olho primeiro. Agora os tiles têm tamanhos
          diferentes, o "100%" ancora em navy (é o número que mais quebra objeção) e
          entra uma foto de lote parceiro pra dar matéria no meio dos números. */}
      <section className="mx-auto max-w-[1100px] px-4 py-10 desktop:px-8 desktop:py-14">
        <div className="grid grid-cols-2 gap-4 desktop:grid-cols-4">
          {/* Ocupa a linha inteira no mobile: com a foto escondida, uma coluna só
              deixaria metade da primeira linha vazia. */}
          <div className="col-span-2 flex flex-col justify-between rounded-lg bg-mp-pale p-6 desktop:col-span-1">
            <p className="text-display-xl text-ink">{METRICS[0].value}</p>
            <p className="mt-3 text-body-sm text-body">{METRICS[0].label}</p>
          </div>

          {/* A foto some no mobile: em duas colunas ela viraria um selo pequeno demais
              pra somar, e só empurraria os números pra fora da primeira tela. */}
          <div className="hidden overflow-hidden rounded-lg desktop:block">
            <img
              src="/Estacionamentos/virapark/virapark_001.webp"
              alt="Pátio de um estacionamento parceiro da Movepark"
              loading="lazy"
              decoding="async"
              className="h-full w-full object-cover"
            />
          </div>

          <div className="col-span-2 flex flex-col justify-between rounded-lg bg-mp-navy p-6 text-white">
            <p className="text-display-xl">{METRICS[1].value}</p>
            <p className="mt-3 text-body-sm text-white/80">{METRICS[1].label}</p>
          </div>

          <div className="col-span-2 flex flex-col justify-between rounded-lg bg-surface-soft p-6">
            <p className="text-display-xl text-ink">{METRICS[2].value}</p>
            <p className="mt-3 text-body-sm text-body">{METRICS[2].label}</p>
          </div>

          <div className="col-span-2 flex flex-col justify-between rounded-lg bg-surface-soft p-6">
            <p className="text-display-xl text-ink">{METRICS[3].value}</p>
            <p className="mt-3 text-body-sm text-body">{METRICS[3].label}</p>
          </div>
        </div>
      </section>

      {/* Como funciona */}
      <section className="mx-auto max-w-[1100px] px-4 pb-16 desktop:px-8 desktop:pb-20">
        <h2 className="text-display-2xl text-ink">Como funciona</h2>
        <p className="mt-2 max-w-2xl text-body-md text-muted">
          Do cadastro ao repasse, a Movepark cuida da parte chata. Você cuida das vagas.
        </p>
        {/* Trilho numerado. Antes eram três colunas de texto com um número solto em
            cima, que não dizia que uma coisa leva à outra. O filete ligando os passos
            é o que transforma três blocos num processo. */}
        <ol className="mt-10 grid grid-cols-1 gap-8 tablet:grid-cols-3">
          {STEPS.map((s, i) => (
            <li key={s.n} className="relative">
              {i < STEPS.length - 1 && (
                // `-right-8` atravessa o gap da grade: parando em `right-0` o filete
                // morreria na borda da coluna e o trilho ficaria picotado.
                <span
                  className="absolute -right-8 left-12 top-5 hidden h-px bg-hairline tablet:block"
                  aria-hidden
                />
              )}
              <span className="relative inline-flex h-10 w-10 items-center justify-center rounded-full bg-mp-navy text-body-sm font-bold tabular-nums text-white">
                {s.n}
              </span>
              <h3 className="mt-5 text-title-md text-ink">{s.title}</h3>
              <p className="mt-1.5 text-body-sm text-body">{s.desc}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Benefícios */}
      <section className="border-y border-hairline bg-surface-soft">
        <div className="mx-auto max-w-[1100px] px-4 py-16 desktop:px-8 desktop:py-20">
          <h2 className="text-display-2xl text-ink">Por que colocar seu estacionamento aqui</h2>
          {/* Bento: os dois destaques ocupam metade da largura cada um na primeira
              linha, os outros quatro dividem a segunda. Sem isso são seis cards
              iguais, e grade uniforme diz que todo benefício pesa o mesmo. */}
          <div className="mt-8 grid grid-cols-1 gap-5 tablet:grid-cols-2 desktop:grid-cols-4">
            {BENEFITS.map((b) => (
              <div
                key={b.title}
                className={cn(
                  "rounded-lg bg-canvas p-6",
                  b.featured && "desktop:col-span-2 desktop:p-8",
                )}
              >
                <span
                  className={cn(
                    "inline-flex items-center justify-center rounded-md bg-mp-pale text-mp-indigo",
                    b.featured ? "h-12 w-12" : "h-10 w-10",
                  )}
                >
                  <b.icon className={b.featured ? "h-6 w-6" : "h-5 w-5"} />
                </span>
                <h3
                  className={cn(
                    "mt-4 text-ink",
                    b.featured ? "text-display-sm" : "text-title-md",
                  )}
                >
                  {b.title}
                </h3>
                <p
                  className={cn(
                    "mt-1.5 text-body",
                    b.featured ? "text-body-md" : "text-body-sm",
                  )}
                >
                  {b.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Vídeo institucional */}
      <section className="mx-auto max-w-[900px] px-4 py-16 text-center desktop:px-8 desktop:py-20">
        <span className="text-badge uppercase tracking-wide text-mp-indigo">
          Conheça a Movepark
        </span>
        <h2 className="mx-auto mt-3 max-w-2xl text-balance text-display-xl text-ink">
          Veja como a Movepark trabalha pelo seu estacionamento
        </h2>
        <div className="mt-8 overflow-hidden rounded-lg">
          <div className="aspect-video">
            <iframe
              className="h-full w-full"
              src="https://www.youtube.com/embed/ZkbAd7B6CIo"
              title="Movepark: vídeo institucional"
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
      <section className="mx-auto max-w-[1100px] px-4 py-14 desktop:px-8">
        <PartnerLogos />
      </section>

      {/* FAQ */}
      <section className="mx-auto max-w-[820px] px-4 pb-16 desktop:px-8 desktop:pb-20">
        <h2 className="mb-4 text-display-2xl text-ink">Perguntas frequentes</h2>
        <FaqList items={FAQ_ITEMS} />
      </section>

      {/* CTA final */}
      <section className="bg-mp-navy">
        <div className="mx-auto max-w-[1100px] px-4 py-16 text-center text-white desktop:px-8 desktop:py-20">
          <h2 className="mx-auto max-w-2xl text-balance text-display-2xl text-white">
            Pronto pra encher suas vagas?
          </h2>
          <p className="mx-auto mt-3 max-w-lg text-balance text-body-md text-white/80">
            Cadastre seu estacionamento em 2 minutos. Sem custo pra começar.
          </p>
          <div className="mt-7 flex justify-center">
            <SejaParceiroCta onClick={openModal}>Quero ser parceiro</SejaParceiroCta>
          </div>
          <p className="mx-auto mt-6 max-w-md text-balance text-caption-sm text-white/60">
            Sem mensalidade. Sem exclusividade. Você põe as vagas, a gente traz o cliente.
          </p>
        </div>
      </section>
    </>
  );
}
