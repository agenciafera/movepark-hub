import { Helmet } from "react-helmet-async";
import { ShieldCheck, MapPin, Star, Users } from "lucide-react";

const VALUES = [
  {
    icon: ShieldCheck,
    title: "Transparência",
    desc: "Preço fixo, sem surpresas. O que você vê na tela é o que você paga na saída.",
  },
  {
    icon: Star,
    title: "Confiança",
    desc: "Só parceiros certificados na plataforma. Cada estacionamento passa por nossa avaliação antes de estrear.",
  },
  {
    icon: MapPin,
    title: "Eficiência",
    desc: "Reserva em menos de 2 minutos. Do celular, sem filas, sem ligação, sem estresse.",
  },
  {
    icon: Users,
    title: "Parceria real",
    desc: "Crescemos junto com os estacionamentos parceiros — mais reservas para eles, mais opções para você.",
  },
];

export default function SobrePage() {
  return (
    <>
      <Helmet>
        <title>Sobre nós | Movepark</title>
        <meta
          name="description"
          content="Conheça a Movepark: o marketplace de reserva de vagas de estacionamento em aeroportos e destinos brasileiros."
        />
        <meta property="og:title" content="Sobre nós | Movepark" />
        <meta
          property="og:description"
          content="Nossa missão é garantir que você chegue ao aeroporto sem estresse — com vaga reservada, preço fixo e sem surpresas."
        />
        <meta property="og:url" content="https://hub.movepark.co/sobre" />
        <link rel="canonical" href="https://hub.movepark.co/sobre" />
      </Helmet>

      <div className="mx-auto w-full max-w-[1080px] px-4 py-12 desktop:px-8">
        {/* Hero */}
        <section className="mb-16 max-w-2xl space-y-4">
          <span className="text-[11px] font-bold uppercase tracking-[0.4px] text-muted-steel">
            Quem somos
          </span>
          <h1 className="text-display-xl text-ink">
            Vaga garantida. Viagem tranquila.
          </h1>
          <p className="text-body-lg text-muted">
            A Movepark nasceu de uma frustração simples: encontrar estacionamento perto do aeroporto
            não deveria ser um jogo de sorte. Criamos um marketplace que conecta viajantes a
            estacionamentos parceiros certificados — com reserva antecipada, preço fixo e
            confirmação instantânea.
          </p>
        </section>

        {/* Missão */}
        <section className="mb-16 rounded-md border border-hairline bg-surface-soft px-8 py-10">
          <h2 className="mb-3 text-title-md text-ink">Nossa missão</h2>
          <p className="max-w-2xl text-body-md text-muted">
            Garantir que cada viajante chegue ao aeroporto sem estresse — com a vaga já reservada,
            o preço combinado e a confiança de que o estacionamento foi avaliado e certificado pela
            Movepark.
          </p>
        </section>

        {/* Valores */}
        <section className="mb-16">
          <h2 className="mb-8 text-title-md text-ink">Nossos valores</h2>
          <div className="grid grid-cols-1 gap-6 tablet:grid-cols-2">
            {VALUES.map((v) => (
              <div key={v.title} className="flex items-start gap-4">
                <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-sm bg-mp-pale text-mp-indigo">
                  <v.icon className="h-5 w-5" />
                </span>
                <div>
                  <div className="text-title-sm text-ink">{v.title}</div>
                  <div className="mt-1 text-body-sm text-muted">{v.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Como funciona em números */}
        <section className="mb-16">
          <h2 className="mb-8 text-title-md text-ink">Em números</h2>
          <div className="grid grid-cols-2 gap-6 tablet:grid-cols-4">
            {[
              { num: "13+", label: "Estacionamentos parceiros" },
              { num: "2 min", label: "Para reservar" },
              { num: "100%", label: "Preço fixo garantido" },
              { num: "24/7", label: "Suporte disponível" },
            ].map((s) => (
              <div key={s.label} className="rounded-md border border-hairline bg-canvas p-5 text-center">
                <div className="text-display-sm font-bold text-mp-indigo">{s.num}</div>
                <div className="mt-1 text-body-sm text-muted">{s.label}</div>
              </div>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="rounded-md bg-mp-pale px-8 py-10 text-center">
          <h2 className="mb-2 text-title-md text-ink">Quer estacionar com a Movepark?</h2>
          <p className="mb-6 text-body-md text-muted">
            Reserve sua vaga em poucos cliques e viaje tranquilo.
          </p>
          <a
            href="/"
            className="inline-flex h-12 items-center rounded-sm bg-mp-primary px-6 text-label font-semibold text-white transition-colors hover:bg-mp-primary/90"
          >
            Buscar estacionamento
          </a>
        </section>
      </div>
    </>
  );
}
