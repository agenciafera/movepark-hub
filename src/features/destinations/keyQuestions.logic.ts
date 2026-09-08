/**
 * As perguntas que decidem a escolha, na página de destino.
 *
 * Auditoria de 08/09/2026 contra os dois concorrentes na mesma praça de Viracopos:
 * a Bandeira Park responde 10 perguntas como SEÇÃO (H2 com a pergunta literal e
 * prosa embaixo) e a xpark 7; a nossa página tinha as perguntas só como gatilho de
 * accordion, com resposta de ~290 caracteres. Recuperação em LLM é por passagem, e
 * passagem ancorada numa pergunta que casa com a do usuário é a mais citável que
 * existe. Tínhamos a pergunta certa e o texto curto demais.
 *
 * O corte é por ESCOPO, e não por uma coluna nova de destaque:
 *
 * - `destination` vira seção. São as perguntas de alta intenção do aeroporto
 *   (traslado, coberta, segurança, oficial vs privado, quanto custa).
 * - `global` fica no accordion. São as de plataforma (como reservo, prazo do PIX,
 *   cancelamento), que se repetem em toda página e não merecem H2 próprio.
 *
 * Isso cai exatamente no modelo de camadas do ADR-002, sem migration e sem uma
 * segunda régua editorial para alguém manter.
 */

/** O mínimo que estas funções precisam saber de uma FAQ. */
export type KeyQuestionSource = {
  id: string;
  scope: string;
  question: string;
  answer: string;
  body_md?: string | null;
  slug?: string | null;
  sort_order: number;
};

/**
 * As que viram seção: só escopo `destination`, na ordem editorial.
 *
 * `auto` e `location` ficam de fora porque não existem nesta página, e `global`
 * fica de fora porque continua no accordion logo abaixo. Sem isso a mesma pergunta
 * apareceria duas vezes na página e duas vezes no `FAQPage`.
 */
export function keyQuestions<T extends KeyQuestionSource>(items: T[] | undefined): T[] {
  return (items ?? [])
    .filter((f) => f.scope === "destination")
    .sort((a, b) => a.sort_order - b.sort_order);
}

/** As que continuam no accordion: tudo que não virou seção. */
export function accordionQuestions<T extends KeyQuestionSource>(items: T[] | undefined): T[] {
  return (items ?? []).filter((f) => f.scope !== "destination");
}

/**
 * O corpo longo pronto para entrar embaixo de um H2 que já é a pergunta.
 *
 * A única coisa que acontece aqui é **descartar o primeiro `##`** do corpo. Ele foi
 * escrito para a página própria da pergunta (`/faq/<slug>`), onde é o título da
 * seção; aqui a pergunta já é o H2, e manter os dois daria dois títulos seguidos
 * dizendo a mesma coisa.
 *
 * O NÍVEL dos títulos que sobram não se resolve aqui, e tentar resolver no Markdown
 * de entrada não funciona: `normalizaTitulos`, no parser, sobe a hierarquia de volta
 * quando o corpo não tem nenhum `h2`. Quem rebaixa é o `PostBody`, depois do parse,
 * via `minHeadingLevel={3}`. Deixar o ajuste lá também preserva a hierarquia interna
 * do corpo: `##` e `###` viram `h3` e `h4`, em vez de colapsarem no mesmo nível.
 *
 * Devolve `null` quando não sobra nada, para a seção não abrir um bloco vazio.
 */
export function sectionBody(bodyMd: string | null | undefined): string | null {
  if (!bodyMd?.trim()) return null;
  const linhas = bodyMd.replace(/\r\n/g, "\n").split("\n");

  // Descarta o primeiro cabeçalho de nível 2, e só ele, e só quando ele ABRE o
  // corpo: cabeçalho depois de prosa é estrutura do texto, não título, e fica.
  const primeiro = linhas.findIndex((l) => /^##\s+\S/.test(l));
  const semTitulo =
    primeiro !== -1 && linhas.slice(0, primeiro).every((l) => !l.trim())
      ? linhas.slice(primeiro + 1)
      : linhas;

  const texto = semTitulo.join("\n").trim();
  return texto || null;
}
