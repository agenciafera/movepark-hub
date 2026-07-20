import { Link } from "react-router-dom";
import { Wordmark } from "./Brand";

type FooterLink = { to: string; label: string; external?: boolean };
type FooterGroup = { title: string; links: FooterLink[] };

const groups: FooterGroup[] = [
  {
    title: "Movepark",
    links: [
      { to: "/sobre", label: "Sobre nós" },
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
  return (
    <footer className="border-t border-hairline bg-surface-soft pb-[var(--bottom-nav-space)] tablet:pb-0">
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
          <div className="text-caption-sm text-muted">
            🌎 PT-BR (R$)
          </div>
        </div>
      </div>
    </footer>
  );
}
