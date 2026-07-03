import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import {
  CreditCard,
  CalendarX,
  QrCode,
  MapPin,
  ShieldCheck,
  HelpCircle,
  MessageCircle,
} from "lucide-react";

const CATEGORIES = [
  {
    icon: CreditCard,
    title: "Pagamentos",
    desc: "PIX, cartão de crédito, parcelamento e recibos.",
    href: "/faq?cat=pagamentos",
  },
  {
    icon: CalendarX,
    title: "Cancelamentos",
    desc: "Prazos, reembolso e como cancelar uma reserva.",
    href: "/cancelamento",
  },
  {
    icon: QrCode,
    title: "Check-in e voucher",
    desc: "Como usar o QR Code na entrada do estacionamento.",
    href: "/faq?cat=check-in",
  },
  {
    icon: MapPin,
    title: "Estacionamentos",
    desc: "Como encontrar, informações de acesso e horários.",
    href: "/faq?cat=estacionamentos",
  },
  {
    icon: ShieldCheck,
    title: "Segurança e confiança",
    desc: "Certificação dos parceiros, cobertura e garantias.",
    href: "/faq?cat=seguranca",
  },
  {
    icon: HelpCircle,
    title: "Dúvidas gerais",
    desc: "Conta, reservas, notificações e mais.",
    href: "/faq",
  },
];

const POPULAR = [
  { q: "Como funciona o preço fixo?", href: "/faq?q=pre%C3%A7o+fixo" },
  { q: "Posso cancelar minha reserva?", href: "/cancelamento" },
  { q: "Como faço o check-in no estacionamento?", href: "/faq?cat=check-in" },
  { q: "O que acontece se meu voo atrasar?", href: "/faq?q=voo+atraso" },
  { q: "Como reservar para mais de um veículo?", href: "/faq?q=dois+ve%C3%ADculos" },
];

export default function AjudaPage() {
  return (
    <>
      <Helmet>
        <title>Central de Ajuda | Movepark</title>
        <meta
          name="description"
          content="Central de ajuda Movepark: tire dúvidas sobre reservas, pagamentos, check-in, cancelamentos e muito mais."
        />
        <meta property="og:title" content="Central de Ajuda | Movepark" />
        <meta property="og:url" content="https://hub.movepark.co/ajuda" />
        <link rel="canonical" href="https://hub.movepark.co/ajuda" />
      </Helmet>

      <div className="mx-auto w-full max-w-[1080px] px-4 py-12 desktop:px-8">
        {/* Hero */}
        <header className="mb-12 space-y-3 text-center">
          <h1 className="text-display-lg text-ink">Como podemos ajudar?</h1>
          <p className="mx-auto max-w-xl text-body-md text-muted">
            Encontre respostas rápidas sobre reservas, pagamentos, check-in e mais.
          </p>
        </header>

        {/* Categorias */}
        <section className="mb-14">
          <h2 className="mb-6 text-title-sm text-ink">Navegar por categoria</h2>
          <div className="grid grid-cols-1 gap-4 tablet:grid-cols-2 desktop:grid-cols-3">
            {CATEGORIES.map((c) => (
              <Link
                key={c.title}
                to={c.href}
                className="flex items-start gap-4 rounded-md border border-hairline bg-canvas p-5 transition-shadow hover:shadow-tier"
              >
                <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-sm bg-mp-pale text-mp-indigo">
                  <c.icon className="h-5 w-5" />
                </span>
                <div>
                  <div className="text-title-sm text-ink">{c.title}</div>
                  <div className="mt-1 text-body-sm text-muted">{c.desc}</div>
                </div>
              </Link>
            ))}
          </div>
        </section>

        {/* Perguntas populares */}
        <section className="mb-14">
          <h2 className="mb-6 text-title-sm text-ink">Perguntas mais frequentes</h2>
          <div className="divide-y divide-hairline rounded-md border border-hairline bg-canvas">
            {POPULAR.map((item) => (
              <Link
                key={item.q}
                to={item.href}
                className="flex items-center justify-between px-5 py-4 text-body-sm text-ink transition-colors hover:bg-surface-soft"
              >
                <span>{item.q}</span>
                <span className="shrink-0 text-muted">→</span>
              </Link>
            ))}
          </div>
          <div className="mt-4 text-center">
            <Link
              to="/faq"
              className="text-body-sm font-medium text-mp-indigo hover:underline"
            >
              Ver todas as perguntas frequentes →
            </Link>
          </div>
        </section>

        {/* Não encontrou */}
        <section className="rounded-md bg-surface-soft px-8 py-10 text-center">
          <MessageCircle className="mx-auto mb-4 h-10 w-10 text-mp-indigo" />
          <h2 className="mb-2 text-title-sm text-ink">Não encontrou o que precisava?</h2>
          <p className="mb-6 text-body-sm text-muted">
            Nossa equipe responde em até 1 dia útil.
          </p>
          <Link
            to="/contato"
            className="inline-flex h-11 items-center rounded-sm bg-mp-primary px-6 text-label font-semibold text-white transition-colors hover:bg-mp-primary/90"
          >
            Falar com o suporte
          </Link>
        </section>
      </div>
    </>
  );
}
