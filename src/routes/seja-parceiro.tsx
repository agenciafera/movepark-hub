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
  FileText,
  Radio,
  Banknote,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { FaqList } from "@/features/faqs/FaqList";
import type { FaqCombinedItem } from "@/features/faqs/api";
import { PartnerLeadModal } from "@/features/onboarding/PartnerLeadModal";
import { PartnerLogos } from "@/features/partners/PartnerLogos";

const HERO_IMAGE = "/images/seja-parceiro-acordo-sunset.webp";
const STEPS_IMAGE = "/Estacionamentos/virapark/virapark_001.webp";

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
    icon: FileText,
    title: "Cadastro rápido",
    desc: "Deixe seu contato. Nossa equipe valida e configura seu estacionamento no sistema, sem burocracia.",
  },
  {
    n: 2,
    icon: Radio,
    title: "Suas vagas no ar",
    desc: "Você aparece na busca. O cliente reserva e paga com antecedência, por PIX ou cartão, antes de chegar.",
  },
  {
    n: 3,
    icon: Banknote,
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

/**
 * Depoimentos ILUSTRATIVOS: trocar pelos reais dos donos de estacionamento.
 *
 * O mockup trazia dois números grandes no lugar do logo ("24% de conversão",
 * "R$ 550k+ de faturamento"). Ficaram de fora: não temos essa medição, e número
 * inventado em página de captação é o tipo de coisa que o parceiro cobra na
 * primeira reunião. O logo do lote prova a mesma coisa sem afirmar o que não
 * dá pra sustentar.
 */
const TESTIMONIALS = [
  {
    quote:
      "A ocupação nos dias de semana subiu de verdade. O cliente já chega pago, sem discussão no balcão.",
    name: "João P.",
    role: "Proprietário · Virapark",
    logo: "logo-virapark.svg",
    logoSize: "h-6",
  },
  {
    quote:
      "Entrei sem pagar nada e comecei a receber reserva na primeira semana. O repasse é organizado e certo.",
    name: "Marina R.",
    role: "Gerente · Garage Inn",
    logo: "logo-garageinn.svg",
    logoSize: "h-5",
  },
  {
    quote:
      "O que mais pesou foi não gastar com marketing. Eles trazem o cliente e eu cuido só das vagas.",
    name: "Carlos A.",
    role: "Sócio · Nation Park",
    logo: "logo-nationpark.svg",
    logoSize: "h-5",
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
          alt="Dono de estacionamento e cliente se cumprimentando no pátio, ao fim da tarde"
          fetchPriority="high"
          decoding="async"
          className="absolute inset-0 h-full w-full object-cover"
        />
        {/* Overlay em degradê, e não chapado. Esta foto é contraluz de fim de tarde
            e o sol estoura dentro da área do h1, o que a média esconde: no trecho
            atrás do texto a foto dá luminância média 0.18, mas com picos de 1.0.
            Com os 30% chapados que a foto anterior usava (parede em sombra, sem
            céu), o branco fica em 6.5:1 na média e despenca pra 1.85:1 em cima do
            sol. O degradê carrega a esquerda a 95% e alivia até 25% à direita: na
            borda direita do h1 o alpha ainda é 0.72, o que põe o pior ponto em
            5.85:1, e os dois rostos seguem visíveis.

            O mobile precisa de mais piso e por isso fecha em 65% em vez de 25%: lá
            o h1 vai quase até a borda direita, em cima da parte iluminada do rosto,
            enquanto no desktop ele para em 53% da largura.

            Sem posição de parada (`from-0%`, `via-55%`): combinadas com a cor por
            variável, essas classes não compilam nada aqui e o `background-image`
            sai `none`, ou seja, overlay invisível e foto crua. O idioma que
            funciona no projeto é este, de `sobre.tsx`: só from/via/to. */}
        <div
          className="absolute inset-0 bg-gradient-to-r from-mp-navy/95 via-mp-navy/85 to-mp-navy/65 desktop:via-mp-navy/75 desktop:to-mp-navy/25"
          aria-hidden
        />
        <div className="relative mx-auto max-w-[1080px] px-4 py-20 text-white desktop:px-8 desktop:py-28">
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
      <section className="mx-auto max-w-[1080px] px-4 py-16 desktop:px-8 desktop:py-20">
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

      {/* Sinais de confiança, em faixa quieta.
          Era um bento com tile navy e foto. Depois dos dois cards grandes e coloridos
          acima, um segundo bloco de peso competia com eles; aqui a faixa de filetes
          funciona como respiro entre a promessa e o mecanismo. Os divisores só
          aparecem no desktop: empilhado, cada linha já se separa sozinha. */}
      <section className="mx-auto max-w-[1080px] px-4 py-4 desktop:px-8">
        <dl className="grid grid-cols-2 border-y border-hairline desktop:grid-cols-4">
          {METRICS.map((m, i) => (
            <div
              key={m.value}
              className={cn(
                "px-2 py-8 desktop:px-6",
                // Filete só entre colunas, nunca na primeira de cada linha.
                i % 2 === 1 && "border-l border-hairline desktop:border-l",
                i >= 2 && "border-t border-hairline desktop:border-t-0",
                i === 2 && "desktop:border-l",
              )}
            >
              <dt className="text-display-xl text-ink">{m.value}</dt>
              <dd className="mt-2 text-body-sm text-body">{m.label}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* Como funciona: foto à esquerda, passos empilhados à direita.
          Eram três colunas de texto. A foto do lote com o card de aprovação flutuando
          faz o passo 1 sair da promessa e virar resultado visível, que é a ideia boa
          do mockup. Os três passos ficam legíveis: o mockup desbotava o 2 e o 3 a
          ponto de reprovar contraste, e o trilho vertical já diz que um leva ao outro. */}
      <section className="mx-auto max-w-[1080px] px-4 py-16 desktop:px-8 desktop:py-20">
        {/* Sem eyebrow: o mockup repetia aqui o "Para donos de estacionamento" que o
            hero já usa, e eyebrow repetido para de rotular e vira ruído. */}
        <div className="max-w-2xl">
          <h2 className="text-display-2xl text-ink">Como funciona</h2>
          <p className="mt-3 text-body-md text-body">
            Do cadastro ao repasse, a Movepark cuida da parte chata. Você cuida das vagas.
          </p>
        </div>

        <div className="mt-12 grid grid-cols-1 items-center gap-10 tablet:grid-cols-2 desktop:gap-14">
          {/* `pb-10` no mobile abre o espaço que o card ocupa ao transbordar a foto;
              sem isso ele encosta no primeiro passo. */}
          <div className="relative pb-10 tablet:pb-0">
            <div className="overflow-hidden rounded-xl">
              <img
                src={STEPS_IMAGE}
                alt="Pátio de um estacionamento parceiro da Movepark"
                loading="lazy"
                decoding="async"
                className="aspect-[4/3] h-full w-full object-cover"
              />
            </div>
            {/* Card de aprovação. Transborda a foto de propósito: encostado nela
                viraria legenda, solto por cima ele lê como notificação do sistema. */}
            <div className="absolute -bottom-0 left-4 right-4 rounded-md border border-hairline bg-canvas p-4 shadow-tier desktop:left-8 desktop:right-10">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-mp-pale text-mp-indigo">
                  <CheckCircle2 className="h-4 w-4" aria-hidden />
                </span>
                <div>
                  <p className="text-title-md text-ink">Cadastro aprovado</p>
                  <p className="mt-1 text-body-sm text-body">
                    Suas vagas já estão na busca e podem receber reserva.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <ol className="relative">
            {STEPS.map((s, i) => (
              <li key={s.n} className="relative flex gap-5 pb-8 last:pb-0">
                {/* Trilho: desce do ícone até o próximo, e some no último item. */}
                {i < STEPS.length - 1 && (
                  <span
                    className="absolute bottom-2 left-6 top-14 w-px bg-hairline"
                    aria-hidden
                  />
                )}
                <span className="relative inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-mp-pale text-mp-indigo">
                  <s.icon className="h-5 w-5" aria-hidden />
                </span>
                <div className="pt-1">
                  <h3 className="text-title-md text-ink">
                    <span className="tabular-nums text-muted">{s.n}.</span> {s.title}
                  </h3>
                  <p className="mt-1.5 text-body-sm text-body">{s.desc}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Benefícios */}
      <section className="border-y border-hairline bg-surface-soft">
        <div className="mx-auto max-w-[1080px] px-4 py-16 desktop:px-8 desktop:py-20">
          <h2 className="text-display-2xl text-ink">Por que colocar seu estacionamento aqui</h2>
          {/* Grade uniforme 3x2, como nos dois mockups. Era um bento com dois
              destaques grandes; agora que "Como funciona" e a faixa de números já
              carregam hierarquia, seis cards do mesmo peso funcionam como lista de
              conferência: o leitor varre, não é conduzido. */}
          <div className="mt-8 grid grid-cols-1 gap-5 tablet:grid-cols-2 desktop:grid-cols-3">
            {BENEFITS.map((b) => (
              <div
                key={b.title}
                className="rounded-lg border border-hairline bg-canvas p-6"
              >
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-mp-pale text-mp-indigo">
                  <b.icon className="h-5 w-5" aria-hidden />
                </span>
                <h3 className="mt-4 text-title-md text-ink">{b.title}</h3>
                <p className="mt-1.5 text-body-sm text-body">{b.desc}</p>
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
        <div className="mt-8 overflow-hidden">
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
        <div className="mx-auto max-w-[1080px] px-4 py-16 desktop:px-8 desktop:py-20">
          <h2 className="text-display-2xl text-ink">Quem já é parceiro conta</h2>
          {/* O logo do lote vai no topo do card e as aspas na ponta oposta, como no
              mockup. `items-stretch` + `flex-1` na citação alinham a assinatura na
              mesma linha nos três cards, mesmo com depoimentos de tamanhos diferentes. */}
          <div className="mt-8 grid grid-cols-1 items-stretch gap-5 tablet:grid-cols-3">
            {TESTIMONIALS.map((t) => (
              <figure
                key={t.name}
                className="flex flex-col rounded-lg border border-hairline bg-canvas p-6"
              >
                <div className="flex items-start justify-between gap-4">
                  <img
                    src={`/images/parceiros/${t.logo}`}
                    alt={t.role.split(" · ")[1]}
                    loading="lazy"
                    decoding="async"
                    className={cn("w-auto object-contain", t.logoSize)}
                  />
                  <Quote className="h-5 w-5 shrink-0 text-mp-violet" aria-hidden />
                </div>
                <blockquote className="mt-6 flex-1 text-body-md text-ink">“{t.quote}”</blockquote>
                <figcaption className="mt-6 border-t border-hairline pt-4 text-body-sm text-muted">
                  <span className="text-ink">{t.name}</span> · {t.role}
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      {/* Marcas */}
      <section className="mx-auto max-w-[1080px] px-4 py-14 desktop:px-8">
        <PartnerLogos />
      </section>

      {/* FAQ em duas colunas, como no mockup: o título fica preso à esquerda e a
          sanfona corre à direita. Numa coluna só, o h2 sumia do campo de visão logo
          na segunda pergunta aberta. `sticky` mantém o contexto durante a leitura. */}
      <section className="mx-auto max-w-[1080px] px-4 pb-16 desktop:px-8 desktop:pb-20">
        <div className="grid grid-cols-1 gap-8 tablet:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] desktop:gap-14">
          <div className="tablet:sticky tablet:top-24 tablet:self-start">
            <span className="text-badge uppercase tracking-wide text-mp-indigo">Dúvidas</span>
            <h2 className="mt-3 text-display-2xl text-ink">Perguntas frequentes</h2>
          </div>
          <FaqList items={FAQ_ITEMS} />
        </div>
      </section>

      {/* CTA final */}
      <section className="bg-mp-navy">
        <div className="mx-auto max-w-[1080px] px-4 py-16 text-center text-white desktop:px-8 desktop:py-20">
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
