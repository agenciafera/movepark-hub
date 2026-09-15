import { describe, expect, it } from "vitest";
import { resumoSaldo } from "./saldo.logic";

const base = {
  company_id: "c1",
  net_partner_cents: 0,
  owed_cents: 0,
  gateway_credited_cents: 0,
  transferred_cents: 0,
  withdrawn_cents: 0,
  balance_cents: 0,
};

describe("resumoSaldo", () => {
  it("em custódia mostra a dívida da Movepark, como sempre mostrou", () => {
    const r = resumoSaldo({ ...base, owed_cents: 50000, balance_cents: 30000, transferred_cents: 20000 });
    expect(r.titulo).toBe("Saldo a receber");
    expect(r.valorCents).toBe(30000);
    expect(r.linhas).toEqual([
      { rotulo: "repassado pela Movepark", valorCents: 20000 },
      { rotulo: "sacado por você", valorCents: 0 },
    ]);
  });

  it("com o split ligado o card fala do crédito, em vez de dizer zero a quem vendeu", () => {
    const r = resumoSaldo({ ...base, net_partner_cents: 80000, gateway_credited_cents: 80000 });
    expect(r.titulo).toBe("Creditado pelo gateway");
    expect(r.valorCents).toBe(80000);
  });

  it("o número é o crédito acumulado, sem descontar saque que não temos como enxergar", () => {
    // `payout_withdrawal` só é alimentada pelo webhook `transfer.*`, que nunca chegou, e recebedor
    // com transferência automática manda o dinheiro ao banco sem passar por nós. Subtrair um zero
    // que não sabemos se é zero fingiria um saldo que ninguém leu.
    const r = resumoSaldo({ ...base, gateway_credited_cents: 80000, withdrawn_cents: 30000 });
    expect(r.valorCents).toBe(80000);
  });

  it("o repasse da Movepark aparece como linha, não somado ao crédito do gateway", () => {
    const r = resumoSaldo({ ...base, gateway_credited_cents: 10000, transferred_cents: 25000 });
    expect(r.valorCents).toBe(10000);
    expect(r.linhas).toContainEqual({ rotulo: "repassado pela Movepark", valorCents: 25000 });
  });

  it("nos dois modos ao mesmo tempo, a dívida aberta vem primeiro", () => {
    const r = resumoSaldo({ ...base, gateway_credited_cents: 40000, balance_cents: 15000 });
    expect(r.titulo).toBe("Creditado pelo gateway");
    expect(r.linhas[0]).toEqual({ rotulo: "a receber da Movepark", valorCents: 15000 });
  });

  it("linha zerada não polui o card", () => {
    const r = resumoSaldo({ ...base, gateway_credited_cents: 40000 });
    expect(r.linhas).toEqual([]);
  });

  it("sem dado nenhum não quebra nem inventa valor", () => {
    expect(resumoSaldo(null)).toEqual({
      titulo: "Saldo a receber",
      valorCents: 0,
      linhas: [
        { rotulo: "repassado pela Movepark", valorCents: 0 },
        { rotulo: "sacado por você", valorCents: 0 },
      ],
    });
  });
});
