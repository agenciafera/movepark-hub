import { formatBRL } from "@/lib/format";
import type { ChangePaidDatesQuote, ChangePaidDatesResult } from "./customerApi";

/**
 * O que a tela mostra na prévia da troca de datas de reserva paga (17/11/2026), antes de qualquer
 * cobrança ou devolução. A diferença segue a tabela de preço da compra: mudar só o dia não custa nada.
 */
export function descreverCotacao(q: ChangePaidDatesQuote): {
  titulo: string;
  detalhe: string;
  /** Botão principal: confirmar (sem diferença ou devolução) ou pagar. Nulo quando não dá. */
  acao: "confirmar" | "pagar" | null;
} {
  if (!q.available || q.delta == null) {
    return { titulo: "Não dá para trocar para essas datas", detalhe: q.reason ?? "Escolha outro período.", acao: null };
  }
  const tabela = q.price_source === "compra"
    ? "A diferença segue a tabela de preço do dia da sua compra."
    : "A diferença segue a tabela de preço desta unidade.";
  const diarias = `${q.days} ${q.days === 1 ? "diária" : "diárias"}`;
  if (q.delta < 0) {
    return {
      titulo: `Você recebe ${formatBRL(-q.delta)} de volta`,
      detalhe: `${diarias} no novo período. A devolução vai pelo mesmo meio de pagamento: no PIX cai em minutos, no cartão aparece em até duas faturas. ${tabela}`,
      acao: "confirmar",
    };
  }
  if (q.delta > 0) {
    return {
      titulo: `A diferença é ${formatBRL(q.delta)}`,
      detalhe: `${diarias} no novo período. As datas mudam quando o pagamento for aprovado. ${tabela}`,
      acao: "pagar",
    };
  }
  return { titulo: "Sem diferença de valor", detalhe: `${diarias} no novo período. ${tabela}`, acao: "confirmar" };
}

/** Mensagem depois de confirmar uma troca sem cobrança (mesmo valor ou mais barata). */
export function mensagemDaTroca(r: Extract<ChangePaidDatesResult, { mode: "applied" }>): string {
  const valor = formatBRL(Math.abs(r.delta));
  if (r.refund_manual) return `Datas alteradas. A devolução de ${valor} vai ser feita pela nossa equipe em até 2 dias úteis.`;
  if (r.refunded) {
    return `Datas alteradas. Devolvemos ${valor} da diferença${r.refund_pending ? ", que seu banco credita em alguns dias" : ""}.`;
  }
  return "Datas da reserva atualizadas.";
}
