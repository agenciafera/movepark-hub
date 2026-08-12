import { cn } from "@/lib/utils";
import { useActiveSection } from "@/features/content/useActiveSection";

type Secao = { id: string; title: string };

/**
 * Trilho de progresso na lateral: uma barrinha por seção, a atual em destaque.
 *
 * Serve para duas coisas ao mesmo tempo. Diz onde o leitor está num guia de seis
 * minutos, que é a pergunta que faz gente desistir no meio, e dá um atalho para
 * pular de seção sem rolar. Cada barra é uma âncora de verdade, com o título da
 * seção no nome acessível, então quem navega por teclado ou leitor de tela chega
 * ao mesmo lugar que quem clica.
 *
 * O estado ativo vem do mesmo `useActiveSection` do índice das páginas de
 * conteúdo: `IntersectionObserver`, não listener de scroll.
 *
 * Só aparece a partir de 1280px. Entre 1128 e 1280 a margem lateral do container
 * é estreita demais, e o trilho encostaria no texto.
 */
export function PostProgress({ secoes }: { secoes: Secao[] }) {
  const ativa = useActiveSection(secoes.map((s) => s.id));

  // Uma barra só não indica progresso nenhum.
  if (secoes.length < 2) return null;

  return (
    <nav
      aria-label="Seções do post"
      className="fixed left-5 top-1/2 z-20 hidden -translate-y-1/2 min-[1280px]:block print:hidden"
    >
      <ul className="flex flex-col gap-3">
        {secoes.map((s) => {
          const on = s.id === ativa;
          return (
            <li key={s.id} className="flex">
              <a
                href={`#${s.id}`}
                aria-current={on ? "true" : undefined}
                className={cn(
                  "block h-0.5 rounded-full transition-all duration-200 motion-reduce:transition-none",
                  on ? "w-7 bg-ink" : "w-4 bg-hairline hover:w-6 hover:bg-muted",
                )}
              >
                <span className="sr-only">{s.title}</span>
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
