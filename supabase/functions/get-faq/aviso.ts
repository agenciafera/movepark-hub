// Pergunta automática da FAQ da unidade com o aviso do estacionamento (política do parceiro que o
// cliente precisa saber antes de chegar). Pura, para o teste; `buildAutoFaq` chama daqui.
// Spec: docs/specs/aviso-do-estacionamento.md.

import { markdownRestritoToLinhas } from "../_shared/markdown-restrito.ts";

export const AVISO_QUESTION = "O estacionamento tem alguma regra que eu preciso saber antes de chegar?";

/**
 * Resposta em texto puro, uma linha por parágrafo ou item, como as outras respostas automáticas
 * (`•` nas listas). O FAQPage do JSON-LD sai do mesmo texto, então aqui não pode haver Markdown.
 * Vazio (nulo ou só espaço) devolve null: a pergunta não existe sem resposta.
 */
export function avisoAutoAnswer(partnerNoticeMd: string | null | undefined): string | null {
  const linhas = markdownRestritoToLinhas(partnerNoticeMd);
  return linhas.length ? linhas.join("\n") : null;
}
