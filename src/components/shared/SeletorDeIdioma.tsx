import { useLocation, useMatches } from "react-router-dom";

import {
  LOCALES,
  LOCALE_PADRAO,
  SEGMENTO,
  caminhoDoIndice,
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

/**
 * O que os loaders publicam sobre os idiomas da página.
 *
 * O slug em português mora num lugar diferente em cada superfície, e é por isso que os
 * três aparecem aqui: `faq.slug` na pergunta, `slug` no post do blog e
 * `destination.public_slug` no destino. A primeira versão só lia os dois primeiros, então
 * nas 44 páginas de destino, que são as que mais recebem gente, o seletor não aparecia.
 */
type DadosComIdiomas = {
  idiomas?: { locale: LocaleTraduzido; slug: string }[];
  traducao?: { slug: string } | null;
  slug?: string;
  faq?: { slug: string };
  destination?: { public_slug?: string | null; slug?: string | null } | null;
};

/**
 * Famílias cujo ÍNDICE existe nos três idiomas.
 *
 * Índice não tem slug, então não entra pelo caminho de item. Hoje a FAQ (`/en/faq`,
 * `/es/preguntas-frecuentes`) e o blog (`/en/blog`, `/es/blog`) têm rota localizada de
 * índice; `/estacionamentos` existe só em português, e oferecer troca de idioma nele
 * levaria a 404. Ao criar um índice localizado novo, a família entra AQUI, senão o
 * rodapé segue mostrando só o rótulo na página que já tem as três versões.
 */
const INDICE_TRADUZIDO: ReadonlySet<keyof typeof SEGMENTO> = new Set(["faq", "blog"]);

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
  if (!familia) return [];

  // Índice (sem slug depois da família): o cluster é fixo, porque a rota existe em cada
  // idioma independentemente de haver item traduzido para listar.
  const { resto } = localeDoCaminho(args.pathname);
  const semSlug = resto.split("/").filter(Boolean).length <= 1;
  if (semSlug) {
    if (!INDICE_TRADUZIDO.has(familia)) return [];
    // `caminhoDoIndice`, e não `caminhoLocalizado` com slug vazio: aquele devolvia o
    // separador solto no fim (`/en/blog/`) e o `replace` que consertava o inglês
    // apagava a barra do `/blog/` português, que é a canônica herdada do WordPress.
    return LOCALES.map((l) => ({ locale: l, caminho: caminhoDoIndice(familia, l) }));
  }

  const idiomas = args.dados?.idiomas ?? [];
  if (idiomas.length === 0) return [];

  // Pela família, e não numa fila de `??`, porque os campos se cruzam: o post do blog
  // também carrega `destination` (o aeroporto de que ele fala), e na fila o slug do
  // aeroporto passava na frente do slug do post. A versão em inglês do post do Aeropark
  // mandava o "Português" para `/blog/aeroporto-guarulhos/`, que não existe, e o
  // `check-internal-links` reprovou o build a partir de 28/09/2026.
  const slugPt =
    familia === "faq"
      ? args.dados?.faq?.slug
      : familia === "destino"
        ? (args.dados?.destination?.public_slug ?? args.dados?.destination?.slug)
        : args.dados?.slug;
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
