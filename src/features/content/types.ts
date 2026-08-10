/**
 * Formato das páginas de conteúdo (termos, cancelamento, FAQ, como funciona).
 *
 * A ideia do handoff: uma casca, seis tipos de bloco, conteúdo como dado. Página
 * institucional nova deve ser um objeto, nunca uma tela nova.
 *
 * O conteúdo mora fora do componente de propósito. Nos documentos legais ele nem
 * fica no repo: vem do `legal_document`, versionado, porque a linha de aceite
 * (`terms_acceptance.document_version_id`) aponta pra versão exata que o cliente
 * leu. Mover esse texto pra cá quebraria a prova.
 */

export type Block =
  | { type: "p"; text: string }
  | { type: "list"; items: string[] }
  | { type: "note"; label: string; text: string }
  | { type: "table"; rows: { k: string; v: string }[] }
  | { type: "faq"; items: { q: string; a: string }[] }
  | { type: "steps"; items: { n: string; title: string; text: string }[] };

export type Section = {
  /** Vira âncora (`#id`), então o suporte consegue mandar link de seção. */
  id: string;
  title: string;
  blocks: Block[];
};

export type ContentPage = {
  slug: string;
  /** Nome curto, usado no índice e nos cards de relacionados. */
  label: string;
  title: string;
  intro: string;
  /** ISO. A view formata; o dado guarda a data crua. */
  updated: string;
  sections: Section[];
  /** Slugs de outras páginas de conteúdo. Curado, não automático. */
  related: string[];
};

/**
 * Data de revisão por extenso, em pt-BR.
 *
 * A data vem como `2026-08-10`, e `new Date` lê isso como meia-noite UTC. No fuso
 * do Brasil, formatar direto devolvia o dia ANTERIOR: um documento revisado dia 10
 * aparecia como 9. Por isso a data só de dia é ancorada ao meio-dia local, longe
 * de qualquer virada de fuso.
 */
export function formatUpdated(iso: string): string {
  const soData = /^\d{4}-\d{2}-\d{2}$/.test(iso);
  const d = new Date(soData ? `${iso}T12:00:00` : iso);
  return d.toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric" });
}

/**
 * Minutos de leitura a partir do texto real da página.
 *
 * 200 palavras por minuto é a média de leitura adulta em português. Fica derivado
 * do conteúdo em vez de escrito à mão: número cravado envelhece na primeira
 * revisão do jurídico e passa a mentir pro leitor.
 */
export function readingMinutes(sections: Section[]): number {
  let palavras = 0;
  const conta = (t: string) => {
    palavras += t.trim().split(/\s+/).filter(Boolean).length;
  };

  for (const s of sections) {
    conta(s.title);
    for (const b of s.blocks) {
      switch (b.type) {
        case "p":
          conta(b.text);
          break;
        case "list":
          b.items.forEach(conta);
          break;
        case "note":
          conta(b.label);
          conta(b.text);
          break;
        case "table":
          b.rows.forEach((r) => {
            conta(r.k);
            conta(r.v);
          });
          break;
        case "faq":
          b.items.forEach((i) => {
            conta(i.q);
            conta(i.a);
          });
          break;
        case "steps":
          b.items.forEach((i) => {
            conta(i.title);
            conta(i.text);
          });
          break;
      }
    }
  }

  return Math.max(1, Math.round(palavras / 200));
}
