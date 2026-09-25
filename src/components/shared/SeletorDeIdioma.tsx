import { useLocation, useMatches } from "react-router-dom";

import {
  LOCALE_PADRAO,
  SEGMENTO,
  caminhoLocalizado,
  localeDoCaminho,
  type Locale,
  type LocaleTraduzido,
} from "@/lib/i18n";

/** Como cada idioma se chama NO próprio idioma, que é a regra de um seletor. */
const NOME_DO_IDIOMA: Record<Locale, string> = {
  "pt-BR": "Português (R$)",
  en: "English (R$)",
  es: "Español (R$)",
};

/** O que os loaders de destino, FAQ e post publicam sobre os idiomas da página. */
type DadosComIdiomas = {
  idiomas?: { locale: LocaleTraduzido; slug: string }[];
  traducao?: { slug: string } | null;
  slug?: string;
  faq?: { slug: string };
};

/**
 * A família da URL atual (`destino`, `faq` ou `blog`), pelo segmento do caminho.
 *
 * Sai do próprio `SEGMENTO`, e não de uma lista paralela, porque uma segunda lista
 * envelheceria calada no dia em que um segmento fosse renomeado.
 */
export function familiaDoCaminho(pathname: string): keyof typeof SEGMENTO | null {
  const { locale, resto } = localeDoCaminho(pathname);
  const primeiro = resto.split("/").filter(Boolean)[0];
  if (!primeiro) return null;
  for (const familia of Object.keys(SEGMENTO) as (keyof typeof SEGMENTO)[]) {
    if (SEGMENTO[familia][locale] === primeiro) return familia;
  }
  return null;
}

/**
 * As alternativas de idioma da página atual, a partir do que o loader publicou.
 *
 * Fica fora do componente para ter teste próprio: a regra que importa é "só idioma que
 * existe entra", e ela não deveria precisar de um `render` para ser verificada.
 *
 * O slug em português é o do dado (`slug` do post/destino, `faq.slug` da pergunta); em
 * idioma traduzido a URL atual usa o slug daquele idioma, que vem em `idiomas`. Montar
 * qualquer uma delas com o slug do outro idioma é o defeito que mandou um `hreflang`
 * para 404 em produção em 25/09/2026.
 */
export function alternativasDeIdioma(args: {
  pathname: string;
  dados: DadosComIdiomas | null;
}): { locale: Locale; caminho: string }[] {
  const familia = familiaDoCaminho(args.pathname);
  const idiomas = args.dados?.idiomas ?? [];
  if (!familia || idiomas.length === 0) return [];

  const slugPt = args.dados?.faq?.slug ?? args.dados?.slug;
  if (!slugPt) return [];

  return [
    { locale: LOCALE_PADRAO as Locale, caminho: caminhoLocalizado({ familia, slug: slugPt, locale: LOCALE_PADRAO }) },
    ...idiomas.map((i) => ({
      locale: i.locale as Locale,
      caminho: caminhoLocalizado({ familia, slug: i.slug, locale: i.locale }),
    })),
  ];
}

/**
 * Seletor de idioma do rodapé.
 *
 * Lê o loader da rota atual por `useMatches`, e não os `<link hreflang>` do documento.
 * A primeira versão raspava o DOM e não funcionava em desenvolvimento, porque o Helmet
 * só escreve o `<head>` no build: um controle que não dá para verificar antes de
 * publicar é um controle que ninguém sabe se funciona.
 *
 * Idioma sem tradução daquela página não aparece, e por isso a maior parte do site
 * mostra só o rótulo. Oferecer um botão que leva a 404 é o mesmo defeito do `hreflang`
 * quebrado, com a agravante de o leitor clicar por vontade própria.
 */
export function SeletorDeIdioma() {
  const { pathname } = useLocation();
  const matches = useMatches();
  // A folha é a última rota casada com dados. `findLast` exigiria lib es2023, e o alvo
  // do projeto é anterior; o reverse resolve sem mexer no tsconfig de todo mundo.
  const dados = ([...matches].reverse().find((m) => m.data)?.data ?? null) as
    | DadosComIdiomas
    | null;

  const atual = localeDoCaminho(pathname).locale;
  const alternativas = alternativasDeIdioma({ pathname, dados });

  // Uma alternativa só é a própria página: não é escolha, é rótulo.
  if (alternativas.length < 2) {
    return <div className="text-caption-sm text-muted">🌎 {NOME_DO_IDIOMA[atual]}</div>;
  }

  return (
    <nav aria-label="Idioma" className="flex items-center gap-2 text-caption-sm text-muted">
      <span aria-hidden>🌎</span>
      {alternativas.map((a, i) => (
        <span key={a.locale} className="flex items-center gap-2">
          {i > 0 && <span aria-hidden>·</span>}
          {a.locale === atual ? (
            <span aria-current="true" className="font-medium text-ink">
              {NOME_DO_IDIOMA[a.locale]}
            </span>
          ) : (
            <a href={a.caminho} className="underline-offset-2 hover:underline">
              {NOME_DO_IDIOMA[a.locale]}
            </a>
          )}
        </span>
      ))}
    </nav>
  );
}
