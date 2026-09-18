import { describe, expect, it } from "vitest";
import {
  appliedCoupon,
  couponAmountLabel,
  couponCapLabel,
  couponIssuer,
  couponRedeemError,
  couponUnavailableReason,
  couponValidityLabel,
  normalizeRedeemInput,
  splitWallet,
  type WalletCoupon,
} from "./couponWallet.logic";

function cupom(over: Partial<WalletCoupon> = {}): WalletCoupon {
  return {
    id: "1",
    code: "BEMVINDO30",
    title: "Primeira reserva",
    terms: null,
    discount_type: "percent",
    discount_value: 30,
    max_discount_amount: 40,
    min_amount: null,
    min_days: null,
    valid_until: null,
    scope: "platform",
    company_name: null,
    audience: "first_purchase",
    is_redeemed: false,
    is_eligible: null,
    reason: null,
    discount: 0,
    is_best: false,
    ...over,
  };
}

describe("couponUnavailableReason", () => {
  it("explica a condição em vez de só negar", () => {
    expect(couponUnavailableReason("not_first_purchase")).toBe("Vale só na primeira reserva");
    expect(couponUnavailableReason("no_stack")).toBe("Não acumula com a promoção desta reserva");
    expect(couponUnavailableReason("not_available_here")).toBe(
      "Este estacionamento não aceita cupom",
    );
  });

  it("cai no genérico sem código e em código desconhecido", () => {
    expect(couponUnavailableReason(null)).toBe("Cupom inválido");
    expect(couponUnavailableReason("algo_que_nao_existe")).toBe("Cupom inválido");
  });
});

describe("couponRedeemError", () => {
  it("fala de guardar, não de usar, quando falta login", () => {
    expect(couponRedeemError("login_required")).toBe("Entre na sua conta para guardar o cupom");
  });

  it("código errado não vira 'cupom inválido', que soa como erro do app", () => {
    expect(couponRedeemError(null)).toBe("Não encontramos esse código");
  });
});

describe("couponAmountLabel", () => {
  it("percentual sai inteiro", () => {
    expect(couponAmountLabel({ discount_type: "percent", discount_value: 30 })).toBe("30% OFF");
  });

  it("valor fixo sai em reais", () => {
    expect(couponAmountLabel({ discount_type: "fixed", discount_value: 15 })).toContain("15");
    expect(couponAmountLabel({ discount_type: "fixed", discount_value: 15 })).toContain("OFF");
  });
});

describe("couponCapLabel", () => {
  it("mostra o teto do percentual", () => {
    expect(couponCapLabel({ discount_type: "percent", max_discount_amount: 40 })).toContain("40");
  });

  it("sem teto não inventa texto", () => {
    expect(couponCapLabel({ discount_type: "percent", max_discount_amount: null })).toBeNull();
  });

  it("valor fixo nunca mostra teto: o próprio valor já é o limite", () => {
    expect(couponCapLabel({ discount_type: "fixed", max_discount_amount: 15 })).toBeNull();
  });
});

describe("couponIssuer", () => {
  it("cupom de plataforma é da Movepark", () => {
    expect(couponIssuer({ scope: "platform", company_name: null })).toBe("Movepark");
  });

  it("cupom de empresa mostra o nome do parceiro", () => {
    expect(couponIssuer({ scope: "company", company_name: "Virapark" })).toBe("Virapark");
  });

  it("empresa sem nome não vira 'Movepark' por engano", () => {
    expect(couponIssuer({ scope: "company", company_name: null })).toBe("Parceiro");
  });
});

describe("couponValidityLabel", () => {
  it("cupom sem prazo não anuncia validade", () => {
    expect(couponValidityLabel({ valid_until: null })).toBeNull();
  });

  it("cupom com prazo diz até quando", () => {
    expect(couponValidityLabel({ valid_until: "2026-12-31T00:00:00Z" })).toContain("Válido até");
  });
});

describe("splitWallet", () => {
  it("só o veredito false manda para indisponível", () => {
    const { available, unavailable } = splitWallet([
      cupom({ id: "a", is_eligible: true, discount: 10 }),
      cupom({ id: "b", is_eligible: false, reason: "min_days" }),
      cupom({ id: "c", is_eligible: null }),
    ]);
    expect(available.map((c) => c.id).sort()).toEqual(["a", "c"]);
    expect(unavailable.map((c) => c.id)).toEqual(["b"]);
  });

  it("sem contexto de pedido nada é chamado de indisponível", () => {
    const { available, unavailable } = splitWallet([
      cupom({ id: "a", is_eligible: null }),
      cupom({ id: "b", is_eligible: null }),
    ]);
    expect(available).toHaveLength(2);
    expect(unavailable).toHaveLength(0);
  });

  it("ordena o disponível pelo maior desconto, para a escolha ser óbvia", () => {
    const { available } = splitWallet([
      cupom({ id: "a", is_eligible: true, discount: 10 }),
      cupom({ id: "b", is_eligible: true, discount: 40 }),
      cupom({ id: "c", is_eligible: true, discount: 25 }),
    ]);
    expect(available.map((c) => c.id)).toEqual(["b", "c", "a"]);
  });
});

describe("appliedCoupon", () => {
  it("casa o código ignorando caixa e espaço", () => {
    const itens = [cupom({ code: "BEMVINDO30" })];
    expect(appliedCoupon(itens, " bemvindo30 ")?.code).toBe("BEMVINDO30");
  });

  it("sem cupom aplicado devolve null", () => {
    expect(appliedCoupon([cupom()], null)).toBeNull();
  });
});

describe("normalizeRedeemInput", () => {
  it("normaliza para maiúsculo sem espaço", () => {
    expect(normalizeRedeemInput("  volta20 ")).toBe("VOLTA20");
  });

  it("entrada vazia vira null, para o submit não chamar a RPC à toa", () => {
    expect(normalizeRedeemInput("   ")).toBeNull();
    expect(normalizeRedeemInput(null)).toBeNull();
  });
});
