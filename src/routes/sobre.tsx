import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { ArrowRight, ArrowUpRight, ShieldCheck, MapPin, Star, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PartnerLogos } from "@/features/partners/PartnerLogos";

const HERO_IMAGE = "/Estacionamentos/virapark-estacionamento-aeroporto-viracopos.webp";

/**
 * Números conferidos no banco em 20/07/2026 (projeto mgaigbezdalbyuqiofcf):
 * unidades e destinos contados sobre `location_parking_type.is_active`, ou seja,
 * só o que dá pra reservar de verdade. Ao atualizar, rode a mesma contagem:
 * número sem lastro é o que a página não pode ter.
 */
const NUMBERS = [
  { value: "26", label: "estacionamentos parceiros" },
  { value: "11", label: "destinos com vaga" },
  { value: "2 min", label: "pra reservar" },
  { value: "100%", label: "do preço fechado na reserva" },
];

/** Destinos com estacionamento parceiro no ar, do mais servido pro menos. */
const DESTINATIONS = [
  { slug: "jardim-paulista", image: "jardim-paulista", name: "Jardim Paulista", city: "São Paulo" },
  {
    slug: "aeroporto-internacional-de-sao-paulo-guarulhos",
    image: "GRU",
    name: "Guarulhos",
    city: "GRU",
  },
  { slug: "aeroporto-afonso-pena", image: "CWB", name: "Afonso Pena", city: "CWB" },
  { slug: "aeroporto-humberto-delgado", image: "LIS", name: "Lisboa", city: "LIS" },
  { slug: "centro-de-sao-paulo", image: "centro-sp", name: "Centro", city: "São Paulo" },
  { slug: "aeroporto-de-congonhas", image: "CGH", name: "Congonhas", city: "CGH" },
  { slug: "aeroporto-de-viracopos", image: "VCP", name: "Viracopos", city: "VCP" },
  { slug: "aeroporto-de-faro", image: "FAO", name: "Faro", city: "FAO" },
];

const STEPS = [
  {
    n: 1,
    title: "Busque pelo destino",
    desc: "Diga pra onde vai e quando. A gente mostra os estacionamentos parceiros com o preço já fechado.",
  },
  {
    n: 2,
    title: "Reserve e pague online",
    desc: "PIX ou cartão. O voucher com QR Code chega na hora, no seu e-mail e na sua conta.",
  },
  {
    n: 3,
    title: "Chegue e deixe o carro",
    desc: "Mostre o QR Code na portaria. O traslado te leva ao terminal e você paga o que estava na tela.",
  },
];

const VALUES = [
  {
    icon: ShieldCheck,
    title: "Transparência",
    desc: "Preço fixo, sem surpresa. O que você vê na tela é o que você paga na saída.",
  },
  {
    icon: Star,
    title: "Confiança",
    desc: "Só parceiro certificado entra. Cada estacionamento passa pela nossa avaliação antes de estrear.",
  },
  {
    icon: MapPin,
    title: "Eficiência",
    desc: "Reserva em menos de 2 minutos, do celular, sem precisar ligar pra ninguém.",
  },
  {
    icon: Users,
    title: "Parceria real",
    desc: "A gente cresce junto com o parceiro: mais reserva pra ele, mais opção pra você.",
  },
];

export default function SobrePage() {
  return (
    <>
      <Helmet>
        <title>Sobre nós | Movepark</title>
        <meta
          name="description"
          content="Conheça a Movepark: o marketplace de reserva de vagas em estacionamentos de aeroportos, centros e terminais, com preço fixo e parceiro certificado."
        />
        <meta property="og:title" content="Sobre nós | Movepark" />
        <meta
          property="og:description"
          content="Nossa missão é simples: você chega no aeroporto com a vaga já reservada e o preço combinado."
        />
        <meta property="og:url" content="https://hub.movepark.co/sobre" />
        <link rel="canonical" href="https://hub.movepark.co/sobre" />
      </Helmet>

      {/* Hero: foto de um lote parceiro de verdade, com a tinta navy da marca por cima. */}
      <section className="relative isolate overflow-hidden bg-mp-navy">
        <img
          src={HERO_IMAGE}
          alt="Vagas cobertas em um estacionamento parceiro da Movepark no aeroporto de Viracopos"
          decoding="async"
          className="absolute inset-0 h-full w-full object-cover opacity-40"
        />
        <div className="absolute inset-0 bg-mp-navy/60" aria-hidden />

        <div className="relative mx-auto max-w-[1080px] px-4 py-16 desktop:px-8 desktop:py-24">
          <div className="max-w-2xl motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-3 motion-safe:duration-500">
            <span className="text-[11px] font-bold uppercase tracking-[0.4px] text-white/70">
              Quem somos
            </span>
            <h1 className="mt-3 text-balance text-display-3xl text-white">
              Vaga garantida. Viagem tranquila.
            </h1>
            <p className="mt-4 max-w-xl text-body-md text-white/80">
              A Movepark nasceu de uma frustração simples: achar vaga perto do aeroporto não
              deveria ser jogo de sorte. Hoje conectamos viajantes a estacionamentos parceiros
              certificados, com reserva antecipada e preço fixo.
            </p>
            <div className="mt-8 flex flex-col gap-3 tablet:flex-row tablet:items-center">
              <Button asChild className="w-full tablet:w-auto">
                <Link to="/search">
                  Buscar estacionamento
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button
                asChild
                variant="secondary"
                className="w-full border-white/40 bg-transparent text-white hover:bg-white/10 tablet:w-auto"
              >
                <Link to="/seja-parceiro">Quero ser parceiro</Link>
              </Button>
            </div>
          </div>
        </div>

      </section>

      {/* Faixa de parceiros: prova concreta, no lugar do carrossel de logo genérico.
          Fora do hero porque os logos são escuros e sumiriam sobre o navy. */}
      <section className="border-b border-hairline bg-canvas">
        <div className="mx-auto max-w-[1080px] px-4 py-10 desktop:px-8 desktop:py-12">
          <PartnerLogos title="Estacionamentos parceiros" />
        </div>
      </section>

      {/* Missão + números */}
      <section className="mx-auto max-w-[1080px] px-4 py-16 desktop:px-8 desktop:py-24">
        <span className="text-[11px] font-bold uppercase tracking-[0.4px] text-mp-indigo">
          Nossa missão
        </span>
        <h2 className="mt-3 max-w-3xl text-balance text-display-2xl text-ink">
          Chegar no aeroporto <span className="text-mp-indigo">sem estresse</span> deveria ser o
          normal.
        </h2>
        <p className="mt-5 max-w-2xl text-body-md text-body">
          A gente cuida da parte chata: achar o estacionamento, comparar preço e garantir que tem
          vaga te esperando. Você chega, deixa o carro e embarca. O estacionamento parceiro só entra
          na plataforma depois de passar pela avaliação da Movepark.
        </p>

        <dl className="mt-12 grid grid-cols-2 gap-x-6 gap-y-10 border-t border-hairline pt-10 desktop:grid-cols-4">
          {NUMBERS.map((n) => (
            // `flex-col-reverse` põe o número em cima na tela sem inverter a ordem
            // semântica: no DOM (e no leitor de tela) o rótulo vem antes do valor.
            <div key={n.label} className="flex flex-col-reverse">
              <dt className="mt-1 text-body-sm text-muted">{n.label}</dt>
              <dd className="text-display-2xl text-ink tabular-nums">{n.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* Onde a Movepark está: o "mapa de destinos" com as fotos reais de cada aeroporto. */}
      <section className="bg-mp-navy">
        <div className="mx-auto max-w-[1080px] px-4 py-16 desktop:px-8 desktop:py-24">
          <span className="text-[11px] font-bold uppercase tracking-[0.4px] text-white/70">
            Onde a gente está
          </span>
          <h2 className="mt-3 max-w-2xl text-balance text-display-2xl text-white">
            De Guarulhos a Lisboa, com a vaga reservada antes de você sair de casa.
          </h2>
          <p className="mt-5 max-w-xl text-body-md text-white/70">
            Aeroportos, centros urbanos e terminais rodoviários. Cada destino tem estacionamentos
            avaliados pela Movepark antes de entrar no ar.
          </p>

          <div className="mt-12 grid grid-cols-2 gap-4 tablet:grid-cols-3 desktop:grid-cols-4">
            {DESTINATIONS.map((d) => (
              <Link
                key={d.slug}
                to={`/destinos/${d.slug}`}
                className="group relative block overflow-hidden rounded-2xl border border-white/10"
              >
                <div className="aspect-[4/3] overflow-hidden bg-white/5">
                  <img
                    src={`/airports/${d.image}.webp`}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className="h-full w-full object-cover opacity-80 transition-[transform,opacity] duration-500 group-hover:scale-105 group-hover:opacity-100 motion-reduce:transition-none motion-reduce:group-hover:scale-100"
                  />
                </div>
                <div
                  className="absolute inset-0 bg-gradient-to-t from-mp-navy via-mp-navy/25 to-transparent"
                  aria-hidden
                />
                <ArrowUpRight className="absolute right-3 top-3 h-4 w-4 text-white/70 transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 motion-reduce:transition-none motion-reduce:group-hover:translate-x-0 motion-reduce:group-hover:translate-y-0" />
                <div className="absolute inset-x-0 bottom-0 p-4">
                  <div className="text-title-md leading-snug text-white">{d.name}</div>
                  <div className="truncate text-caption-sm text-white/70">{d.city}</div>
                </div>
              </Link>
            ))}
          </div>

          <div className="mt-8">
            <Link
              to="/destinos"
              className="inline-flex items-center gap-2 text-body-md font-medium text-white underline-offset-4 hover:underline"
            >
              Ver todos os destinos
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* Como funciona: foto do contexto real (embarque) + os 3 passos. */}
      <section className="mx-auto max-w-[1080px] px-4 py-16 desktop:px-8 desktop:py-24">
        <div className="grid grid-cols-1 gap-10 tablet:grid-cols-2 tablet:items-center desktop:gap-16">
          <div className="order-2 tablet:order-1">
            <span className="text-[11px] font-bold uppercase tracking-[0.4px] text-mp-indigo">
              Como funciona
            </span>
            <h2 id="como-funciona" className="mt-3 text-balance text-display-2xl text-ink">
              Três passos e o carro está guardado.
            </h2>
            <ol aria-labelledby="como-funciona" className="mt-8 space-y-6">
              {STEPS.map((s) => (
                <li key={s.n} className="flex gap-4">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-mp-pale text-body-sm font-bold text-mp-indigo">
                    {s.n}
                  </span>
                  <div>
                    <h3 className="text-title-md text-ink">{s.title}</h3>
                    <p className="mt-1 text-body-sm text-body">{s.desc}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>

          <div className="order-1 overflow-hidden rounded-2xl tablet:order-2">
            <img
              src="/images/como-reservar.webp"
              alt="Viajante reservando a vaga pelo celular na área de embarque do aeroporto"
              loading="lazy"
              decoding="async"
              className="aspect-[4/3] h-full w-full object-cover"
            />
          </div>
        </div>
      </section>

      {/* Valores */}
      <section className="border-t border-hairline bg-surface-soft">
        <div className="mx-auto max-w-[1080px] px-4 py-16 desktop:px-8 desktop:py-24">
          <span className="text-[11px] font-bold uppercase tracking-[0.4px] text-mp-indigo">
            No que a gente acredita
          </span>
          <h2 className="mt-3 max-w-2xl text-balance text-display-2xl text-ink">
            Quatro compromissos que não mudam.
          </h2>

          <div className="mt-12 grid grid-cols-1 gap-x-10 gap-y-8 tablet:grid-cols-2">
            {VALUES.map((v) => (
              <div key={v.title} className="flex items-start gap-4">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sm bg-mp-pale text-mp-indigo">
                  <v.icon className="h-5 w-5" />
                </span>
                <div>
                  <h3 className="text-title-md text-ink">{v.title}</h3>
                  <p className="mt-1 text-body-sm text-body">{v.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA final */}
      <section className="mx-auto max-w-[1080px] px-4 py-16 desktop:px-8 desktop:py-24">
        <div className="rounded-2xl bg-mp-pale px-6 py-12 text-center desktop:px-16">
          <h2 className="mx-auto max-w-xl text-balance text-display-2xl text-ink">
            Sua próxima viagem começa com a vaga resolvida.
          </h2>
          <p className="mx-auto mt-4 max-w-md text-body-md text-body">
            Busque pelo aeroporto ou destino e reserve em poucos minutos.
          </p>
          <div className="mt-8 flex justify-center">
            <Button asChild>
              <Link to="/search">
                Buscar estacionamento
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </section>
    </>
  );
}
