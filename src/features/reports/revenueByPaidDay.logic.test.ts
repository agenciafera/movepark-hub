import { describe, expect, it } from "vitest";
import { tallyRevenueByPaidDay } from "./revenueByPaidDay.logic";

describe("tallyRevenueByPaidDay (receita por dia do pagamento, 09/11/2026)", () => {
  it("agrupa pela data do pagamento no fuso de Brasília, não pelo dia UTC", () => {
    const rows = tallyRevenueByPaidDay([
      // 23h30 de 09/11 em Brasília é 02h30 de 10/11 em UTC: tem que cair no dia 09.
      { total_amount: 100, payments: [{ paid_at: "2026-11-10T02:30:00Z" }] },
      { total_amount: "50.5", payments: [{ paid_at: "2026-11-09T13:00:00Z" }] },
      { total_amount: 80, payments: [{ paid_at: "2026-11-10T15:00:00Z" }] },
    ]);
    expect(rows).toEqual([
      { date: "2026-11-09", total: 150.5, parking: 150.5, net: 0, count: 2 },
      { date: "2026-11-10", total: 80, parking: 80, net: 0, count: 1 },
    ]);
  });

  it("reserva cobrada duas vezes conta uma vez só, no primeiro pagamento", () => {
    const rows = tallyRevenueByPaidDay([
      {
        total_amount: 120,
        payments: [{ paid_at: "2026-10-20T12:00:00Z" }, { paid_at: "2026-10-18T12:00:00Z" }],
      },
    ]);
    expect(rows).toEqual([{ date: "2026-10-18", total: 120, parking: 120, net: 0, count: 1 }]);
  });

  it("reserva sem data de pagamento fica de fora", () => {
    expect(tallyRevenueByPaidDay([{ total_amount: 90, payments: [{ paid_at: null }] }])).toEqual([]);
    expect(tallyRevenueByPaidDay([{ total_amount: 90, payments: null }])).toEqual([]);
  });

  // Visão do estacionamento (23/11/2026): o plano é da Movepark, então o gráfico do Operator conta
  // só as diárias, na mesma base da visão por check-in. O total segue sendo o que o cliente pagou.
  it("com o detalhe do preço, `parking` traz só as diárias e `total` o valor cobrado", () => {
    const rows = tallyRevenueByPaidDay([
      {
        total_amount: 120,
        price_breakdown: {
          line_items: [
            { kind: "parking", name: "Diárias", subtotal: 100 },
            { kind: "fare", name: "Plano", subtotal: 20 },
          ],
        },
        payments: [{ paid_at: "2026-11-23T15:00:00Z" }],
      },
    ]);
    expect(rows).toEqual([{ date: "2026-11-23", total: 120, parking: 100, net: 0, count: 1 }]);
  });
});
