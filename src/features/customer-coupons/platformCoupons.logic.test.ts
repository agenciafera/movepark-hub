import { describe, expect, it } from "vitest";
import {
  buildPlatformCouponArgs,
  EMPTY_PLATFORM_COUPON_FORM,
  platformCouponToForm,
  usageLabel,
  validatePlatformCouponForm,
  type PlatformCouponFormValues,
} from "./platformCoupons.logic";

function form(over: Partial<PlatformCouponFormValues> = {}): PlatformCouponFormValues {
  return {
    ...EMPTY_PLATFORM_COUPON_FORM,
    code: "BEMVINDO30",
    discount_type: "percent",
    discount_value: 30,
    max_discount_amount: 40,
    ...over,
  };
}

describe("validatePlatformCouponForm", () => {
  it("aceita uma campanha percentual bem montada", () => {
    expect(validatePlatformCouponForm(form())).toBeNull();
  });

  it("percentual SEM TETO é recusado: é o buraco que faz a Movepark pagar a diferença", () => {
    const erro = validatePlatformCouponForm(form({ max_discount_amount: null }));
    expect(erro).toMatch(/teto/i);
  });

  it("teto em cupom de valor fixo é recusado: dois números diriam o mesmo limite", () => {
    const erro = validatePlatformCouponForm(
      form({ discount_type: "fixed", discount_value: 15, max_discount_amount: 20 }),
    );
    expect(erro).toMatch(/Teto só existe/i);
  });

  it("valor fixo sem teto passa", () => {
    expect(
      validatePlatformCouponForm(
        form({ discount_type: "fixed", discount_value: 15, max_discount_amount: null }),
      ),
    ).toBeNull();
  });

  it("winback exige a régua de dias, senão a audiência fica implícita", () => {
    const erro = validatePlatformCouponForm(form({ audience: "winback" }));
    expect(erro).toMatch(/dias sem reservar/i);
  });

  it("dias sem reservar fora do winback é recusado", () => {
    const erro = validatePlatformCouponForm(
      form({ audience: "public", audience_inactive_days: 60 }),
    );
    expect(erro).toMatch(/Sumiu há um tempo/i);
  });

  it("winback com régua passa", () => {
    expect(
      validatePlatformCouponForm(form({ audience: "winback", audience_inactive_days: 60 })),
    ).toBeNull();
  });

  it("código é obrigatório e não aceita espaço", () => {
    expect(validatePlatformCouponForm(form({ code: "  " }))).toMatch(/código/i);
    expect(validatePlatformCouponForm(form({ code: "BEM VINDO" }))).toMatch(/espaço/i);
  });

  it("percentual acima de 100 é recusado", () => {
    expect(validatePlatformCouponForm(form({ discount_value: 120 }))).toMatch(/100%/);
  });

  it("validade invertida é recusada", () => {
    const erro = validatePlatformCouponForm(
      form({ valid_from: "2026-10-10", valid_until: "2026-10-01" }),
    );
    expect(erro).toMatch(/anterior/i);
  });
});

describe("buildPlatformCouponArgs", () => {
  it("normaliza o código para maiúsculo e sem espaço nas pontas", () => {
    const args = buildPlatformCouponArgs(null, form({ code: "  bemvindo30 " }));
    expect(args.p_code).toBe("BEMVINDO30");
  });

  it("criar manda id null; editar manda o id", () => {
    expect(buildPlatformCouponArgs(null, form()).p_id).toBeNull();
    expect(buildPlatformCouponArgs("cup-9", form()).p_id).toBe("cup-9");
  });

  it("valor fixo nunca leva teto, mesmo se o campo ficou preenchido de antes", () => {
    const args = buildPlatformCouponArgs(
      null,
      form({ discount_type: "fixed", discount_value: 15, max_discount_amount: 40 }),
    );
    expect(args.p_max_discount_amount).toBeNull();
  });

  it("audiência que não é winback nunca leva dias, mesmo se o campo ficou preenchido", () => {
    const args = buildPlatformCouponArgs(
      null,
      form({ audience: "first_purchase", audience_inactive_days: 60 }),
    );
    expect(args.p_audience_inactive_days).toBeNull();
  });

  it("texto em branco vira null, para a carteira não mostrar linha vazia", () => {
    const args = buildPlatformCouponArgs(null, form({ title: "   ", terms: "" }));
    expect(args.p_title).toBeNull();
    expect(args.p_terms).toBeNull();
  });

  it("a validade final cobre o dia inteiro, senão o cupom morre à meia-noite do próprio dia", () => {
    const args = buildPlatformCouponArgs(null, form({ valid_until: "2026-10-01" }));
    expect(args.p_valid_until).toBeTruthy();
    const d = new Date(args.p_valid_until!);
    expect(d.getHours()).toBe(23);
  });

  it("sem datas, manda null em vez de string vazia", () => {
    const args = buildPlatformCouponArgs(null, form({ valid_from: "", valid_until: "" }));
    expect(args.p_valid_from).toBeNull();
    expect(args.p_valid_until).toBeNull();
  });
});

describe("platformCouponToForm", () => {
  it("volta do banco para o form sem perder campo, com numeric vindo como string", () => {
    const v = platformCouponToForm({
      code: "VOLTA20",
      title: "Bom te ver de volta",
      description: null,
      terms: "Para quem está há mais de 60 dias sem reservar.",
      discount_type: "percent",
      discount_value: "20.00",
      max_discount_amount: "30.00",
      audience: "winback",
      audience_inactive_days: 60,
      valid_from: null,
      valid_until: "2026-12-31T23:59:59.000Z",
      max_uses: null,
      per_user_limit: null,
      min_amount: null,
      min_days: null,
      is_active: true,
      is_advertised: true,
      sort_order: 30,
    });
    expect(v.discount_value).toBe(20);
    expect(v.max_discount_amount).toBe(30);
    expect(v.audience).toBe("winback");
    expect(v.audience_inactive_days).toBe(60);
    expect(v.valid_until).toBe("2026-12-31");
    expect(v.valid_from).toBe("");
    expect(v.description).toBe("");
  });

  it("ida e volta preserva o que o gestor digitou", () => {
    const original = form({ audience: "winback", audience_inactive_days: 45, max_uses: 100 });
    const args = buildPlatformCouponArgs(null, original);
    const devolta = platformCouponToForm({
      code: args.p_code,
      title: args.p_title,
      description: args.p_description,
      terms: args.p_terms,
      discount_type: args.p_discount_type,
      discount_value: args.p_discount_value,
      max_discount_amount: args.p_max_discount_amount,
      audience: args.p_audience,
      audience_inactive_days: args.p_audience_inactive_days,
      valid_from: args.p_valid_from,
      valid_until: args.p_valid_until,
      max_uses: args.p_max_uses,
      per_user_limit: args.p_per_user_limit,
      min_amount: args.p_min_amount,
      min_days: args.p_min_days,
      is_active: args.p_is_active,
      is_advertised: args.p_is_advertised,
      sort_order: args.p_sort_order,
    });
    expect(devolta.code).toBe("BEMVINDO30");
    expect(devolta.discount_value).toBe(30);
    expect(devolta.max_discount_amount).toBe(40);
    expect(devolta.audience_inactive_days).toBe(45);
    expect(devolta.max_uses).toBe(100);
  });
});

describe("usageLabel", () => {
  it("sem limite, mostra só quantos usos houve", () => {
    expect(usageLabel(1, null)).toBe("1 uso");
    expect(usageLabel(7, null)).toBe("7 usos");
  });

  it("com limite, mostra o fôlego que sobrou da campanha", () => {
    expect(usageLabel(7, 100)).toBe("7 de 100");
  });
});
