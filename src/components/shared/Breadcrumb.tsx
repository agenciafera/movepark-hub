import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

export type Trilha = {
  label: string;
  /** Sem `to`, o item é a página atual e fecha a trilha. */
  to?: string;
};

type Props = {
  items: Trilha[];
  /**
   * "claro" é a trilha sobre canvas (o desenho original, da página de destino).
   * "escuro" é a mesma trilha dentro da faixa navy de abertura, onde `text-muted`
   * daria 2.7:1 e reprovaria.
   */
  tom?: "claro" | "escuro";
  className?: string;
};

/**
 * Trilha de navegação, no desenho da página de destino (`/destinos/<slug>`),
 * escolhido como padrão em 17/08/2026.
 *
 * Era marcação solta em dois lugares, com duas linguagens: a página de destino
 * usava lista semântica com `›` e `aria-current`, e as páginas de conteúdo
 * tinham um `nav` sem lista, separado por `/`. Leitor de tela anunciava as duas
 * de formas diferentes.
 *
 * O separador é `aria-hidden` porque quem lê a tela recebe a estrutura pela
 * lista, e ouvir "sinal de maior" entre os itens só atrapalha.
 */
export function Breadcrumb({ items, tom = "claro", className }: Props) {
  const escuro = tom === "escuro";

  return (
    <nav aria-label="Trilha de navegação" className={className}>
      <ol
        className={cn(
          "flex flex-wrap items-center gap-1.5 text-body-sm",
          escuro ? "text-white/80" : "text-muted",
        )}
      >
        {items.map((item, i) => (
          <li key={item.label} className="flex items-center gap-1.5">
            {i > 0 && (
              <span aria-hidden className={escuro ? "text-white/60" : "text-muted-steel"}>
                ›
              </span>
            )}
            {item.to ? (
              <Link to={item.to} className={escuro ? "hover:text-white" : "hover:text-ink"}>
                {item.label}
              </Link>
            ) : (
              <span aria-current="page" className={escuro ? "text-white" : "text-ink"}>
                {item.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
