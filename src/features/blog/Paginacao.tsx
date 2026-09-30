import { Link } from "react-router-dom";

import { pageHref, pageWindow } from "./listing.logic";
import { LOCALE_PADRAO, type Locale } from "@/lib/i18n";
import { textos } from "@/lib/i18nTextos";
import { cn } from "@/lib/utils";

/**
 * Barra de paginação da listagem do blog, nos três idiomas.
 *
 * Mora fora da página porque o índice traduzido usa a mesma barra com outro rótulo,
 * e a alternativa era duplicar quarenta linhas de markup por idioma. O `base` já vem
 * com o prefixo do idioma (`/en/blog`), então `pageHref` não precisa saber de idioma.
 */
export function Paginacao({
  page,
  total,
  base,
  locale = LOCALE_PADRAO,
  href = pageHref,
}: {
  page: number;
  total: number;
  base: string;
  locale?: Locale;
  /**
   * Como montar a URL de uma página. O default é o do português, que termina com
   * barra por herança do WordPress; o índice traduzido passa o dele, sem barra, porque
   * lá `/en/blog/` é 301 para `/en/blog` e a barra viraria canônica que redireciona.
   */
  href?: (page: number, base: string) => string;
}) {
  if (total <= 1) return null;
  const T = textos(locale);

  return (
    <nav
      aria-label={T.blogPaginacao}
      className="mt-10 flex flex-wrap items-center justify-center gap-2"
    >
      {page > 1 && (
        <Link
          to={href(page - 1, base)}
          rel="prev"
          className="rounded-sm border border-hairline px-3 py-2 text-body-sm text-body hover:bg-surface-soft"
        >
          {T.blogAnterior}
        </Link>
      )}

      {pageWindow(page, total).map((p, i) =>
        p === null ? (
          <span key={`gap-${i}`} className="px-1 text-body-sm text-muted" aria-hidden>
            ...
          </span>
        ) : (
          <Link
            key={p}
            to={href(p, base)}
            aria-current={p === page ? "page" : undefined}
            className={cn(
              "min-w-10 rounded-sm border px-3 py-2 text-center text-body-sm",
              p === page
                ? "border-mp-primary bg-mp-primary text-white"
                : "border-hairline text-body hover:bg-surface-soft",
            )}
          >
            {p}
          </Link>
        ),
      )}

      {page < total && (
        <Link
          to={href(page + 1, base)}
          rel="next"
          className="rounded-sm border border-hairline px-3 py-2 text-body-sm text-body hover:bg-surface-soft"
        >
          {T.blogProxima}
        </Link>
      )}
    </nav>
  );
}
