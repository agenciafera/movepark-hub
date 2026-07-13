import { describe, expect, it } from "vitest";
import {
  isCheckoutBlocked,
  nextStepOnConfirm,
  resolveCheckoutGate,
  shouldPollCheckout,
  validateStep1Identity,
  type CheckoutGateArgs,
  type Step1IdentityInput,
} from "./checkout.logic";

const baseGate: CheckoutGateArgs = {
  authLoading: false,
  bookingLoading: false,
  hasSession: true,
  userId: "u1",
  code: "MP-ABC123",
  profile: { first_name: "Fulano", tax_id: "12345678900" },
  hasError: false,
  booking: { profile_id: "u1" },
};

describe("resolveCheckoutGate", () => {
  it("loading enquanto auth ou booking carregam", () => {
    expect(resolveCheckoutGate({ ...baseGate, authLoading: true }).kind).toBe("loading");
    expect(resolveCheckoutGate({ ...baseGate, bookingLoading: true }).kind).toBe("loading");
  });

  it("redireciona pro login (com next) quando anônimo", () => {
    const gate = resolveCheckoutGate({ ...baseGate, hasSession: false });
    expect(gate).toEqual({
      kind: "redirect",
      to: `/login?next=${encodeURIComponent("/checkout/MP-ABC123")}`,
    });
  });

  it("redireciona pra completar perfil quando falta first_name ou tax_id", () => {
    const semNome = resolveCheckoutGate({
      ...baseGate,
      profile: { first_name: null, tax_id: "123" },
    });
    expect(semNome).toEqual({
      kind: "redirect",
      to: `/account/complete-profile?next=${encodeURIComponent("/checkout/MP-ABC123")}`,
    });
    const semCpf = resolveCheckoutGate({
      ...baseGate,
      profile: { first_name: "Fulano", tax_id: null },
    });
    expect(semCpf.kind).toBe("redirect");
  });

  it("não redireciona enquanto o perfil ainda não carregou (undefined)", () => {
    expect(resolveCheckoutGate({ ...baseGate, profile: undefined }).kind).toBe("ready");
  });

  it("erro tem precedência sobre booking ausente", () => {
    expect(resolveCheckoutGate({ ...baseGate, hasError: true, booking: null }).kind).toBe("error");
  });

  it("not-found quando não há booking", () => {
    expect(resolveCheckoutGate({ ...baseGate, booking: null }).kind).toBe("not-found");
  });

  it("not-owner quando o booking é de outro usuário", () => {
    expect(resolveCheckoutGate({ ...baseGate, booking: { profile_id: "outro" } }).kind).toBe(
      "not-owner",
    );
  });

  it("ready no caminho feliz", () => {
    expect(resolveCheckoutGate(baseGate).kind).toBe("ready");
  });
});

describe("isCheckoutBlocked", () => {
  const now = new Date("2026-06-23T12:00:00Z");

  it("bloqueia reserva pendente passada do prazo", () => {
    expect(isCheckoutBlocked("2026-06-23T11:59:00Z", "pending", now)).toBe(true);
  });

  it("bloqueia reserva cancelada (inclui a expirada que o cron cancelou), mesmo com prazo futuro ou nulo", () => {
    // Regressão do furo: cancelada mostrava um checkout mudo, sem contador nem aviso.
    expect(isCheckoutBlocked("2026-06-23T12:30:00Z", "cancelled", now)).toBe(true);
    expect(isCheckoutBlocked(null, "cancelled", now)).toBe(true);
  });

  it("não bloqueia se o prazo é futuro (pendente)", () => {
    expect(isCheckoutBlocked("2026-06-23T12:01:00Z", "pending", now)).toBe(false);
  });

  it("não bloqueia estados de sucesso/pós-reserva", () => {
    expect(isCheckoutBlocked("2026-06-23T11:00:00Z", "confirmed", now)).toBe(false);
    expect(isCheckoutBlocked("2026-06-23T11:00:00Z", "checked_in", now)).toBe(false);
    expect(isCheckoutBlocked("2026-06-23T11:00:00Z", "completed", now)).toBe(false);
  });

  it("sem expires_at, pendente nunca bloqueia", () => {
    expect(isCheckoutBlocked(null, "pending", now)).toBe(false);
  });
});

describe("nextStepOnConfirm", () => {
  it("avança pro 4 quando confirmado e ainda não está no 4", () => {
    expect(nextStepOnConfirm("confirmed", 1)).toBe(4);
    expect(nextStepOnConfirm("confirmed", 3)).toBe(4);
  });

  it("não mexe se já está no 4", () => {
    expect(nextStepOnConfirm("confirmed", 4)).toBeNull();
  });

  it("não avança enquanto pendente", () => {
    expect(nextStepOnConfirm("pending", 3)).toBeNull();
  });
});

describe("shouldPollCheckout", () => {
  it("faz polling enquanto a reserva está pendente", () => {
    expect(shouldPollCheckout("pending", null)).toBe(true);
  });

  it("faz polling enquanto o pagamento está pendente", () => {
    expect(shouldPollCheckout("confirmed", "pending")).toBe(true);
  });

  it("para de pollar quando reserva e pagamento saíram de pending", () => {
    expect(shouldPollCheckout("confirmed", "paid")).toBe(false);
    expect(shouldPollCheckout(undefined, undefined)).toBe(false);
  });
});

describe("validateStep1Identity", () => {
  const base: Step1IdentityInput = {
    firstName: "Pedro",
    lastName: "Araujo",
    phone: "+5511987654321", // BR válido
    email: "",
    loggedInWithEmail: true, // logou por e-mail: campo travado, não valida
    forOther: false,
    otherName: "",
    otherPhone: undefined,
  };

  it("ok com telefone válido (login por e-mail)", () => {
    expect(validateStep1Identity(base)).toBeNull();
  });

  it("exige nome e sobrenome", () => {
    expect(validateStep1Identity({ ...base, firstName: "  " })).toMatch(/nome/i);
    expect(validateStep1Identity({ ...base, lastName: "" })).toMatch(/nome/i);
  });

  it("telefone é OBRIGATÓRIO: vazio ou só o DDI '+55' não passa", () => {
    expect(validateStep1Identity({ ...base, phone: undefined })).toMatch(/telefone/i);
    expect(validateStep1Identity({ ...base, phone: "+55" })).toMatch(/telefone/i);
    expect(validateStep1Identity({ ...base, phone: "+5511" })).toMatch(/telefone/i);
  });

  it("login por telefone: e-mail de contato vira obrigatório e é validado", () => {
    const viaPhone: Step1IdentityInput = { ...base, loggedInWithEmail: false, email: "" };
    expect(validateStep1Identity(viaPhone)).toMatch(/e-mail/i);
    expect(validateStep1Identity({ ...viaPhone, email: "invalido" })).toMatch(/e-mail/i);
    expect(validateStep1Identity({ ...viaPhone, email: "pedro@fera.ag" })).toBeNull();
  });

  it("reserva pra outra pessoa exige nome e telefone do passageiro", () => {
    const other: Step1IdentityInput = { ...base, forOther: true, otherName: "", otherPhone: undefined };
    expect(validateStep1Identity(other)).toMatch(/nome/i);
    expect(validateStep1Identity({ ...other, otherName: "Maria" })).toMatch(/telefone/i);
    expect(
      validateStep1Identity({ ...other, otherName: "Maria", otherPhone: "+5511987654321" }),
    ).toBeNull();
  });
});
