import { describe, expect, it } from "vitest";
import { descreverCotacao, mensagemDaTroca } from "./changeDatesPaid.logic";
import type { ChangePaidDatesQuote } from "./customerApi";

const q = (over: Partial<ChangePaidDatesQuote>): ChangePaidDatesQuote => ({
  mode: "quote", available: true, reason: null, days: 3, days_before: 5, price_source: "compra",
  current_total: 157.4, new_total: 99.6, delta: -57.8, delta_cents: -5780, effect: "refund", card_allowed: false, ...over,
});

// Troca de datas de reserva paga (17/11/2026): o cliente vê o valor antes de confirmar.
describe("descreverCotacao", () => {
  it("mais barato: quanto volta, por onde e em quanto tempo, e que vale a tabela da compra", () => {
    const r = descreverCotacao(q({}));
    expect(r.titulo).toMatch(/Você recebe R\$\s?57,80 de volta/);
    expect(r.detalhe).toMatch(/duas faturas/);
    expect(r.detalhe).toMatch(/tabela de preço do dia da sua compra/);
    expect(r.acao).toBe("confirmar");
  });
  it("mais caro: a diferença e que as datas só mudam com o pagamento aprovado", () => {
    const r = descreverCotacao(q({ delta: 25.7, delta_cents: 2570, effect: "charge" }));
    expect(r.titulo).toMatch(/A diferença é R\$\s?25,70/);
    expect(r.detalhe).toMatch(/quando o pagamento for aprovado/);
    expect(r.acao).toBe("pagar");
  });
  it("mesma duração: sem diferença", () => {
    expect(descreverCotacao(q({ delta: 0, delta_cents: 0, effect: "none", days: 5 })).titulo).toBe("Sem diferença de valor");
  });
  it("reserva antiga (sem tabela guardada) diz que segue a tabela da unidade", () => {
    expect(descreverCotacao(q({ price_source: "hoje" })).detalhe).toMatch(/tabela de preço desta unidade/);
  });
  it("período que a unidade não vende: o motivo, sem botão", () => {
    const r = descreverCotacao(q({ available: false, delta: null, delta_cents: null, reason: "Nesta unidade o mínimo é de 3 diárias." }));
    expect(r.detalhe).toBe("Nesta unidade o mínimo é de 3 diárias.");
    expect(r.acao).toBeNull();
  });
  it("nenhum texto com travessão", () => {
    for (const c of [q({}), q({ delta: 10, delta_cents: 1000 }), q({ delta: 0, delta_cents: 0 }), q({ available: false, delta: null })]) {
      const r = descreverCotacao(c);
      expect(/[–—]/.test(r.titulo + r.detalhe)).toBe(false);
    }
  });
});

describe("mensagemDaTroca", () => {
  it("devolução feita, em processamento e na fila manual", () => {
    expect(mensagemDaTroca({ mode: "applied", delta: -57.8, total_amount: 99.6, refunded: true, refund_pending: false })).toMatch(/Devolvemos R\$\s?57,80/);
    expect(mensagemDaTroca({ mode: "applied", delta: -57.8, total_amount: 99.6, refunded: true, refund_pending: true })).toMatch(/alguns dias/);
    expect(mensagemDaTroca({ mode: "applied", delta: -57.8, total_amount: 99.6, refunded: false, refund_pending: false, refund_manual: true })).toMatch(/2 dias úteis/);
    expect(mensagemDaTroca({ mode: "applied", delta: 0, total_amount: 157.4, refunded: false, refund_pending: false })).toBe("Datas da reserva atualizadas.");
  });
});
