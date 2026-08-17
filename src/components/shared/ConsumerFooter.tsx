import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Wordmark } from "./Brand";

type FooterLink = { to: string; label: string; external?: boolean };
type FooterGroup = { title: string; links: FooterLink[] };

const groups: FooterGroup[] = [
  {
    title: "Movepark",
    links: [
      { to: "/sobre", label: "Sobre nós" },
      // Barra final de propósito: é a URL canônica do blog, herdada do WordPress.
      { to: "/blog/", label: "Blog" },
      { to: "/precos", label: "Índice de preços" },
      { to: "/calculadora-estacionamento-aeroporto", label: "Calculadora de estacionamento" },
      { to: "/termos", label: "Termos de uso" },
      { to: "/privacidade", label: "Política de privacidade" },
    ],
  },
  {
    title: "Estacionamentos",
    links: [
      { to: "/seja-parceiro", label: "Seja parceiro" },
      { to: "/operator", label: "Painel do estacionamento" },
    ],
  },
  {
    title: "Suporte",
    links: [
      { to: "/faq", label: "Perguntas frequentes" },
      { to: "/como-funciona", label: "Como funciona" },
      { to: "/cancelamento", label: "Política de cancelamento" },
      { to: "/contato", label: "Fale conosco" },
    ],
  },
];

const linkClass = "text-body-sm text-muted no-underline hover:text-ink";

export function ConsumerFooter() {
  // Sem borda no topo: a faixa colorida da chamada já separa o rodapé do
  // conteúdo, e a hairline aparecia como um risco claro sobre ela.
  return (
    <footer className="bg-surface-soft">
      {/* Chamada pro FAQ: a central responde antes de o suporte precisar responder,
          e é porta de entrada pras páginas por pergunta (/faq/<slug>). */}
      <div className="bg-mp-primary">
        <div className="mx-auto flex w-full max-w-[1280px] flex-col items-start justify-between gap-4 px-6 py-8 tablet:flex-row tablet:items-center desktop:px-8">
          <div>
            <p className="text-title-md text-white">Dúvidas sobre estacionamento de aeroporto?</p>
            <p className="mt-1 text-body-sm text-white">
              Preços, traslado, cancelamento e check-in: as respostas estão na central.
            </p>
          </div>
          {/* Botão do sistema (8px de raio, 48px de altura). Escrito à mão ele saía
              com `rounded-md`, que aqui é 14px, e num botão baixo virava pílula. */}
          <Button
            asChild
            variant="secondary"
            className="shrink-0 bg-white text-mp-indigo no-underline hover:bg-mp-pale hover:brightness-100"
          >
            <Link to="/faq">Ver perguntas frequentes</Link>
          </Button>
        </div>
      </div>
      <div className="mx-auto grid w-full max-w-[1280px] grid-cols-1 gap-8 px-6 py-12 tablet:grid-cols-3 desktop:grid-cols-3 desktop:px-8">
        {groups.map((g) => (
          <div key={g.title} className="space-y-3">
            <h4 className="text-title-sm text-ink">{g.title}</h4>
            <ul className="space-y-2">
              {g.links.map((l) => (
                <li key={l.label}>
                  {l.external ? (
                    <a href={l.to} target="_blank" rel="noopener noreferrer" className={linkClass}>
                      {l.label}
                    </a>
                  ) : (
                    <Link to={l.to} className={linkClass}>
                      {l.label}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-hairline-soft">
        <div className="mx-auto flex w-full max-w-[1280px] flex-col items-start justify-between gap-4 px-6 py-6 tablet:flex-row tablet:items-center desktop:px-8">
          <div className="flex items-center gap-3">
            <Wordmark height={18} />
            <span className="text-caption-sm text-muted">
              © {new Date().getFullYear()} Movepark
            </span>
          </div>
          <div className="text-caption-sm text-muted">🌎 PT-BR (R$)</div>
        </div>
      </div>
    </footer>
  );
}
