import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import {
  AirplaneLanding,
  Car,
  CheckCircle,
  EnvelopeSimple,
  Headset,
  Key,
  LockSimple,
  MagnifyingGlass,
  PhoneCall,
  QrCode,
  SealCheck,
  ShieldCheck,
  UserCircle,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { faqSchema } from "@/lib/jsonld";
import { useGsapReveal } from "@/hooks/useGsapReveal";
import { cn } from "@/lib/utils";
import {
  JOURNEY,
  JOURNEY_COMPARISON,
  JOURNEY_FAQ,
  JOURNEY_GUARANTEES,
  JOURNEY_HEADLINE,
  JOURNEY_LEAD,
  JOURNEY_STATS,
  journeyHowToJsonLd,
  type JourneyStep,
} from "@/features/how-it-works/journey";

const EYEBROW = "text-badge uppercase tracking-[0.4px] text-mp-indigo";

const GUARANTEE_ICON = { seal: SealCheck, lock: LockSimple, headset: Headset };

/**
 * Numerador dos passos, comum aos três momentos. A numeração corre de 1 a 7.
 *
 * A bolinha é violeta porque aqui ela é indicador-chave, o mesmo papel que o
 * violeta já cumpre num número de destaque. Branco sobre `mp-primary` dá 4.86:1,
 * acima do mínimo de 4.5 que o AA pede nesse tamanho.
 */
function Steps({ steps }: { steps: JourneyStep[] }) {
  return (
    <ol className="flex flex-col gap-5">
      {steps.map((s) => (
        <li key={s.n} className="flex items-start gap-3">
          <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-mp-primary text-badge text-white">
            {s.n}
          </span>
          <span className="text-pretty text-body-md text-body">{s.text}</span>
        </li>
      ))}
    </ol>
  );
}

/**
 * Painel do momento 1: a busca. Reproduz a barra do topo da home e dois
 * resultados, com o preço já somado.
 *
 * Os resultados são genéricos de propósito. Foto e nome de parceiro aqui poriam
 * a marca de um lote para explicar a Movepark sem que ele tenha topado, que é a
 * regra combinada em 13/08/2026 e guardada por `home/fotoDeParceiro.test.ts`.
 * O que a ilustração precisa mostrar é a forma do resultado, não quem é o lote.
 */
function BuscaPanel() {
  const resultados = [
    { nome: "Vaga coberta", meta: "4 min do terminal", preco: "R$ 32,80", destaque: true },
    { nome: "Vaga descoberta", meta: "7 min do terminal", preco: "R$ 26,40", destaque: false },
  ];

  return (
    <div className="flex flex-col gap-3 rounded-lg bg-surface-pale p-4 desktop:p-6">
      <div className="flex items-center gap-3 rounded-full bg-canvas py-2 pl-5 pr-2 shadow-tier">
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-badge uppercase tracking-[0.4px] text-muted">Aeroporto</span>
          <span className="truncate text-body-sm font-semibold text-ink">
            Curitiba · Afonso Pena
          </span>
        </span>
        <span className="h-7 w-px shrink-0 bg-hairline" aria-hidden />
        <span className="flex shrink-0 flex-col">
          <span className="text-badge uppercase tracking-[0.4px] text-muted">Datas</span>
          <span className="whitespace-nowrap text-body-sm font-semibold text-ink">05 a 06 ago</span>
        </span>
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-mp-primary text-white"
          aria-hidden
        >
          <MagnifyingGlass className="h-4 w-4" weight="bold" />
        </span>
      </div>

      {resultados.map((r) => (
        <div
          key={r.nome}
          className={cn(
            "flex items-center gap-3 rounded-md bg-canvas p-3",
            r.destaque ? "border-2 border-mp-navy" : "border border-hairline",
          )}
        >
          <span
            className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-sm bg-surface-strong text-mp-indigo"
            aria-hidden
          >
            <Car className="h-6 w-6" />
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-body-sm font-semibold text-ink">{r.nome}</span>
            <span className="truncate text-caption-sm text-muted">{r.meta}</span>
          </span>
          <span className="flex shrink-0 flex-col items-end">
            <span className="text-title-md text-ink">{r.preco}</span>
            <span className="text-caption-sm text-muted">total</span>
          </span>
        </div>
      ))}

      <p className="flex items-center gap-2 rounded-sm bg-canvas px-3 py-2.5 text-body-sm font-semibold text-success">
        <LockSimple className="h-4 w-4 shrink-0" aria-hidden />
        Preço fechado na confirmação
      </p>
    </div>
  );
}

/** Painel do momento 2: o voucher que chega depois do pagamento. */
function VoucherPanel() {
  return (
    <div className="flex flex-col gap-3 rounded-lg bg-surface-soft p-4 desktop:p-6">
      <div className="flex flex-col gap-3.5 rounded-md bg-canvas p-4 shadow-tier">
        <div className="flex items-center justify-between gap-3">
          <span className="flex flex-col">
            <span className="text-badge uppercase tracking-[0.4px] text-muted">
              Reserva confirmada
            </span>
            <span className="text-display-sm tracking-[0.4px] text-ink">MP-E2AA17</span>
          </span>
          <span
            className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-sm border border-hairline text-muted-soft"
            aria-hidden
          >
            <QrCode className="h-7 w-7" />
          </span>
        </div>
        <dl className="grid grid-cols-2 overflow-hidden rounded-sm border border-hairline">
          <div className="border-r border-hairline px-3 py-2">
            <dt className="text-badge uppercase tracking-[0.4px] text-muted">Placa</dt>
            <dd className="text-body-sm font-semibold tracking-[0.3px] text-ink">FCQ-1166</dd>
          </div>
          <div className="px-3 py-2">
            <dt className="text-badge uppercase tracking-[0.4px] text-muted">Tarifa</dt>
            <dd className="text-body-sm font-semibold text-ink">Flex</dd>
          </div>
        </dl>
        <p className="flex items-center gap-2 rounded-full bg-badge-confirmed-bg px-3 py-2 text-caption text-success">
          <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden />
          Cancele grátis até 04 ago, 21:00
        </p>
      </div>
      <div className="flex gap-3">
        <p className="flex flex-1 flex-col gap-1.5 rounded-sm bg-canvas p-3 text-body-sm font-semibold text-ink">
          <EnvelopeSimple className="h-5 w-5 text-muted" aria-hidden />
          Voucher no seu e-mail
        </p>
        <p className="flex flex-1 flex-col gap-1.5 rounded-sm bg-canvas p-3 text-body-sm font-semibold text-ink">
          <UserCircle className="h-5 w-5 text-muted" aria-hidden />E na sua conta Movepark
        </p>
      </div>
    </div>
  );
}

/**
 * Painel do momento 3: a volta, em linha do tempo.
 *
 * Os horários são exemplo e a legenda diz isso. Sem ela, quatro carimbos de
 * relógio numa página institucional leem como promessa de tempo, e a Movepark
 * não controla o relógio da unidade nem o da esteira de bagagem.
 */
function VoltaPanel() {
  const linha = [
    { Icon: AirplaneLanding, titulo: "Voo pousou", sub: "Você já pode avisar", hora: "18:40" },
    {
      Icon: PhoneCall,
      titulo: "Aviso para a unidade",
      sub: "Contato no comprovante",
      hora: "18:45",
    },
    { Icon: ShieldCheck, titulo: "Carro liberado", sub: "Sem taxa de espera", hora: "18:52" },
    {
      Icon: Key,
      titulo: "Chave na sua mão",
      sub: "Mesmo lugar, mesmo valor",
      hora: "19:00",
      fim: true,
    },
  ];

  return (
    <div className="flex flex-col gap-2.5 rounded-lg bg-surface-pale p-4 desktop:p-6">
      {linha.map((l) => (
        <div
          key={l.titulo}
          className={cn(
            "flex items-center gap-3 rounded-sm px-3.5 py-3",
            l.fim ? "bg-mp-navy" : "bg-canvas",
          )}
        >
          <span
            className={cn(
              "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
              l.fim ? "bg-white/15 text-white" : "bg-surface-pale text-mp-indigo",
            )}
            aria-hidden
          >
            <l.Icon className="h-4 w-4" />
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className={cn("text-body-sm font-semibold", l.fim ? "text-white" : "text-ink")}>
              {l.titulo}
            </span>
            <span className={cn("text-caption-sm", l.fim ? "text-white/70" : "text-muted")}>
              {l.sub}
            </span>
          </span>
          <span
            className={cn(
              "shrink-0 whitespace-nowrap text-caption tabular-nums",
              l.fim ? "text-white" : "text-ink",
            )}
          >
            {l.hora}
          </span>
        </div>
      ))}
      <p className="text-caption-sm text-muted">
        Exemplo de uma volta. O tempo varia com a unidade e com o horário.
      </p>
    </div>
  );
}

const PAINEIS = [BuscaPanel, VoucherPanel, VoltaPanel];

export default function ComoFuncionaPage() {
  const passosRef = useGsapReveal<HTMLElement>({
    selector: "[data-reveal]",
    y: 20,
    stagger: 0.08,
    start: "top 85%",
  });
  const garantiasRef = useGsapReveal<HTMLElement>({
    selector: "[data-reveal]",
    y: 20,
    stagger: 0.08,
    start: "top 85%",
  });

  return (
    <>
      <Helmet>
        <title>Como funciona | Movepark</title>
        <meta
          name="description"
          content="Da busca à chave de volta na sua mão: reserve online, mostre o QR Code na portaria e pegue o carro no mesmo lugar. Preço fechado e vaga garantida."
        />
        <meta property="og:title" content="Como funciona | Movepark" />
        <meta property="og:url" content="https://hub.movepark.co/como-funciona" />
        <link rel="canonical" href="https://hub.movepark.co/como-funciona" />
        <script type="application/ld+json">{JSON.stringify(journeyHowToJsonLd())}</script>
        <script type="application/ld+json">
          {JSON.stringify(faqSchema(JOURNEY_FAQ.map((f) => ({ question: f.q, answer: f.a }))))}
        </script>
      </Helmet>

      {/* Hero de marca. A faixa é o gradiente da identidade (indigo, violeta,
          indigo), o mesmo utilitário do resto do projeto: aqui o violeta é
          superfície de marca, e o acionável é o botão branco em cima dela. */}
      <section className="bg-brand-gradient">
        <div className="mx-auto flex max-w-[1080px] flex-col items-center gap-4 px-4 pb-24 pt-16 text-center desktop:px-8 desktop:pb-28 desktop:pt-24">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/15 px-3.5 py-1.5 text-caption text-white">
            <SealCheck className="h-4 w-4 shrink-0" aria-hidden />
            Estacionamentos verificados em 6 aeroportos
          </span>
          <h1 className="max-w-3xl text-balance text-display-3xl text-white">
            Sua vaga garantida antes de sair de casa
          </h1>
          <p className="max-w-[56ch] text-pretty text-body-md text-white">
            Você reserva online, deixa o carro com quem já esperava por você e segue para o
            embarque. Na volta, o carro está no mesmo lugar.
          </p>
          <div className="mt-2 flex flex-wrap justify-center gap-3">
            <Button
              asChild
              variant="secondary"
              className="bg-white text-mp-indigo no-underline hover:bg-mp-pale hover:brightness-100"
            >
              <Link to="/">Buscar vaga no meu aeroporto</Link>
            </Button>
            <Button
              asChild
              variant="secondary"
              className="border border-white/40 bg-transparent text-white no-underline hover:bg-white/10 hover:brightness-100"
            >
              <a href="#passos">Ver os 3 momentos</a>
            </Button>
          </div>
        </div>

      </section>

      {/* Faixa de sinais, montada em cima da divisão entre o hero e o branco: o
          card fica partido pela borda, em vez de só encostar nela.

          O recuo é `-mt` num IRMÃO do hero, e não `-mb` num filho dele. Como o
          hero não tem padding nem borda embaixo, a margem negativa de um último
          filho ATRAVESSA a seção (margin collapsing) em vez de encurtá-la: o card
          continuava inteiro dentro do violeta, encostado na borda. Entre irmãos a
          margem colapsa de forma previsível e puxa o card pra cima de verdade.

          No mobile o card empilha os três sinais e fica alto demais para ser
          cortado ao meio, então lá o avanço é menor. */}
      <div className="relative z-10 mx-auto -mt-12 max-w-[1080px] px-4 tablet:-mt-[77px] desktop:px-8">
        <dl className="grid grid-cols-1 rounded-md bg-canvas p-6 shadow-tier tablet:grid-cols-3 tablet:p-9">
          {JOURNEY_STATS.map((s, i) => (
            <div
              key={s.value}
              className={cn(
                "flex flex-col gap-1.5 py-4 tablet:py-0",
                i > 0 && "border-t border-hairline tablet:border-l tablet:border-t-0 tablet:pl-7",
                i === 0 && "pt-0 tablet:pr-7",
                i === JOURNEY_STATS.length - 1 && "pb-0",
              )}
            >
              <dt className="text-display-xl text-mp-navy">{s.value}</dt>
              <dd className="text-pretty text-body-sm text-body">{s.label}</dd>
            </div>
          ))}
        </dl>
      </div>

      {/* Os três momentos. Alterna texto e painel a cada linha no desktop; no
          mobile a ordem da fonte manda e o texto vem sempre antes do painel. */}
      <section
        id="passos"
        ref={passosRef}
        className="mx-auto max-w-[1080px] scroll-mt-24 px-4 py-16 desktop:px-8 desktop:py-24"
      >
        <div className="flex flex-col items-center gap-3 text-center" data-reveal>
          <span className={EYEBROW}>Como funciona</span>
          <h2 className="max-w-3xl text-balance text-display-2xl text-ink">{JOURNEY_HEADLINE}</h2>
          <p className="max-w-[56ch] text-pretty text-body-md text-body">{JOURNEY_LEAD}</p>
        </div>

        <div className="mt-12 flex flex-col gap-14 desktop:mt-16 desktop:gap-20">
          {JOURNEY.map((m, i) => {
            const Painel = PAINEIS[i];
            const painelPrimeiro = i % 2 === 1;
            return (
              <div
                key={m.id}
                id={m.id}
                className="grid grid-cols-1 items-center gap-8 tablet:grid-cols-2 desktop:gap-14"
                data-reveal
              >
                <div
                  className={cn("flex min-w-0 flex-col gap-4", painelPrimeiro && "tablet:order-2")}
                >
                  <span className="self-start rounded-full bg-surface-pale px-3 py-1.5 text-caption text-mp-indigo">
                    {m.label}
                  </span>
                  <h3 className="text-balance text-display-xl text-ink">{m.title}</h3>
                  <p className="max-w-[56ch] text-pretty text-body-md text-body">{m.lead}</p>
                  <Steps steps={m.steps} />
                </div>
                <div className={cn("min-w-0", painelPrimeiro && "tablet:order-1")}>
                  <Painel />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Garantias. Faixa em surface-soft para separar do fluxo sem pintar de cor. */}
      <section ref={garantiasRef} className="border-y border-hairline bg-surface-soft">
        <div className="mx-auto max-w-[1080px] px-4 py-16 desktop:px-8 desktop:py-24">
          <div className="flex flex-col items-center gap-3 text-center" data-reveal>
            <span className={EYEBROW}>Garantias</span>
            <h2 className="max-w-2xl text-balance text-display-2xl text-ink">
              O que a Movepark garante por escrito
            </h2>
          </div>
          <div className="mt-10 grid grid-cols-1 gap-4 tablet:grid-cols-3 desktop:mt-14">
            {JOURNEY_GUARANTEES.map((g) => {
              const Icon = GUARANTEE_ICON[g.icon];
              return (
                <div
                  key={g.title}
                  className="flex flex-col gap-3 rounded-md bg-canvas p-6"
                  data-reveal
                >
                  <span
                    className="flex h-10 w-10 items-center justify-center rounded-sm bg-surface-pale text-mp-indigo"
                    aria-hidden
                  >
                    <Icon className="h-5 w-5" />
                  </span>
                  <h3 className="text-title-md text-ink">{g.title}</h3>
                  <p className="text-pretty text-body-md text-body">{g.text}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Comparação. O cabeçalho fica fixo no desktop enquanto as linhas correm. */}
      <section className="mx-auto max-w-[1080px] px-4 py-16 desktop:px-8 desktop:py-24">
        <div className="grid grid-cols-1 items-start gap-8 desktop:grid-cols-[320px_1fr] desktop:gap-14">
          <div className="flex min-w-0 flex-col gap-3 desktop:sticky desktop:top-[calc(var(--topbar-offset,5rem)+1.5rem)]">
            <span className={EYEBROW}>Comparação</span>
            <h2 className="text-balance text-display-2xl text-ink">Com reserva ou no balcão</h2>
            <p className="max-w-[56ch] text-pretty text-body-md text-body">
              A diferença aparece justamente no dia em que tudo está corrido.
            </p>
          </div>

          <div className="min-w-0 overflow-hidden rounded-md border border-hairline">
            <div className="hidden gap-4 border-b border-hairline bg-surface-soft px-5 py-3 tablet:grid tablet:grid-cols-[108px_1fr_1fr]">
              <span />
              <span className={EYEBROW}>Com Movepark</span>
              <span className="text-badge uppercase tracking-[0.4px] text-muted">
                Chegando sem reserva
              </span>
            </div>
            {JOURNEY_COMPARISON.map((c, i) => (
              <div
                key={c.k}
                className={cn(
                  "grid grid-cols-1 gap-3 px-5 py-4 tablet:grid-cols-[108px_1fr_1fr] tablet:gap-4",
                  i > 0 && "border-t border-hairline",
                )}
              >
                <span className="text-caption text-muted">{c.k}</span>
                <span className="flex min-w-0 flex-col gap-1">
                  <span className="text-badge uppercase tracking-[0.4px] text-mp-indigo tablet:hidden">
                    Com Movepark
                  </span>
                  <span className="flex items-start gap-2">
                    <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden />
                    <span className="text-pretty text-body-sm font-semibold text-ink">{c.mp}</span>
                  </span>
                </span>
                <span className="flex min-w-0 flex-col gap-1">
                  <span className="text-badge uppercase tracking-[0.4px] text-muted tablet:hidden">
                    Chegando sem reserva
                  </span>
                  <span className="text-pretty pl-6 text-body-sm text-muted tablet:pl-0">
                    {c.other}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Dúvidas. `forceMount` mantém a resposta no DOM com o item fechado, que é
          o que faz o texto sair no HTML do build (ADR-002): crawler de IA não
          executa JS, e o FAQPage acima precisa bater com o visível. */}
      <section className="border-t border-hairline">
        <div className="mx-auto grid max-w-[1080px] grid-cols-1 items-start gap-8 px-4 py-16 desktop:grid-cols-[300px_1fr] desktop:gap-14 desktop:px-8 desktop:py-24">
          <div className="flex min-w-0 flex-col gap-3">
            <span className={EYEBROW}>Dúvidas</span>
            <h2 className="text-balance text-display-2xl text-ink">O que mais perguntam</h2>
            <Link
              to="/faq"
              className="self-start text-body-md font-semibold text-mp-primary underline underline-offset-4"
            >
              Ver todas as perguntas
            </Link>
          </div>
          <div className="min-w-0">
            <Accordion type="single" collapsible defaultValue="q-0">
              {JOURNEY_FAQ.map((f, i) => (
                <AccordionItem key={f.q} value={`q-${i}`}>
                  <AccordionTrigger>{f.q}</AccordionTrigger>
                  <AccordionContent forceMount className="text-pretty">
                    {f.a}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </div>
      </section>

      {/* Fechamento em navy, e não no gradiente do desenho. Logo abaixo dele vem a
          chamada violeta do `ConsumerFooter`, e dois blocos violeta colados leem
          como uma faixa só: é a mesma razão que tirou o violeta do `PageHero`. Em
          navy o gradiente fica sendo o momento de marca exclusivo do hero. */}
      <section className="mx-auto max-w-[1080px] px-4 pb-16 desktop:px-8 desktop:pb-24">
        <div className="flex flex-col items-start gap-4 rounded-lg bg-mp-navy p-8 text-left desktop:items-center desktop:p-14 desktop:text-center">
          <h2 className="max-w-2xl text-balance text-display-2xl text-white">
            Encontre sua vaga para a próxima viagem
          </h2>
          <p className="max-w-[56ch] text-pretty text-body-md text-white">
            Reserva em dois minutos, cancelamento grátis conforme a Tarifa e o preço que você vê é o
            que você paga.
          </p>
          <div className="mt-2 flex flex-wrap gap-3">
            <Button
              asChild
              variant="secondary"
              className="bg-white text-mp-indigo no-underline hover:bg-mp-pale hover:brightness-100"
            >
              <Link to="/">Buscar vaga</Link>
            </Button>
            <Button
              asChild
              variant="secondary"
              className="border border-white/40 bg-transparent text-white no-underline hover:bg-white/10 hover:brightness-100"
            >
              <Link to="/contato">Falar com o suporte</Link>
            </Button>
          </div>
        </div>
      </section>
    </>
  );
}
