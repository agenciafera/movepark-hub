/**
 * O FAQ da página de destino em camadas (ADR-002), para o gêmeo Markdown.
 *
 * A página React recebe da Edge `get-faq` o FAQ do destino mesclado com o global e
 * deduplicado pela pergunta, mantendo a camada mais específica. Ela mostra as do destino
 * como seção e as globais no accordion "Perguntas gerais", e o `FAQPage` leva as duas.
 *
 * O gerador do `.md` listava só as do destino, então o agente que lê Markdown via metade
 * da página (12 perguntas contra 21 em Congonhas, medido em 26/11/2026). Esta função
 * repete a regra da Edge (`supabase/functions/get-faq/index.ts`, dedupe e ordenação) sem
 * a camada `location`, que não existe na página de destino.
 */

/** Mesma chave de dedupe da Edge: a pergunta sem espaço nas pontas e em caixa baixa. */
const chave = (f) => String(f.question ?? "").trim().toLowerCase();

/** Ordem da Edge depois do escopo: categoria, depois `sort_order`. */
function porCategoriaEOrdem(a, b) {
  const ca = a.category?.sort_order ?? 999;
  const cb = b.category?.sort_order ?? 999;
  if (ca !== cb) return ca - cb;
  return (a.sort_order ?? 0) - (b.sort_order ?? 0);
}

/**
 * @param {Array<{scope: string, question: string, sort_order?: number, category?: {sort_order?: number} | null, destination?: {slug?: string} | null}>} faqs
 *   todas as FAQs publicadas de escopo `global` e `destination`
 * @param {string} destinoSlug
 * @returns {{ doDestino: typeof faqs, gerais: typeof faqs }} disjuntas, na ordem da página
 */
export function faqDaPaginaDeDestino(faqs, destinoSlug) {
  // As do destino viram seção na página na ordem editorial pura (`keyQuestions`, em
  // src/features/destinations/keyQuestions.logic.ts): só `sort_order`, sem categoria.
  const doDestino = faqs
    .filter((f) => f.scope === "destination" && f.destination?.slug === destinoSlug)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  const perguntasDoDestino = new Set(doDestino.map(chave));
  const vistas = new Set();
  const gerais = faqs
    .filter((f) => f.scope === "global")
    .sort(porCategoriaEOrdem)
    .filter((f) => {
      const k = chave(f);
      if (perguntasDoDestino.has(k) || vistas.has(k)) return false;
      vistas.add(k);
      return true;
    });
  return { doDestino, gerais };
}

/**
 * As perguntas do `FAQPage` do HTML que faltam no gêmeo Markdown da mesma página.
 *
 * Roda no `audit-structured-data` depois do build, sobre o `dist/`: se o gerador do `.md` voltar
 * a esquecer uma camada, o build reprova em vez de a divergência ser achada por curl meses depois.
 *
 * @param {string[]} perguntasDoHtml os `name` dos `Question` do FAQPage
 * @param {string} md o Markdown da página
 * @returns {string[]} as que não aparecem como `###` depois de "## Perguntas frequentes"
 */
export function perguntasFaltandoNoMd(perguntasDoHtml, md) {
  const inicio = md.indexOf("## Perguntas frequentes");
  const trecho = inicio >= 0 ? md.slice(inicio) : "";
  const noMd = new Set(
    [...trecho.matchAll(/^### (.+)$/gm)].map(([, q]) => q.trim().toLowerCase()),
  );
  return perguntasDoHtml.filter((q) => !noMd.has(String(q).trim().toLowerCase()));
}
