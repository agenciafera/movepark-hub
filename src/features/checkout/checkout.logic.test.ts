import { describe, expect, it } from "vitest";
import {
  isCheckoutExpired,
  nextStepOnConfirm,
  resolveCheckoutGate,
  shouldPollCheckout,
  type CheckoutGateArgs,
} from "./checkout.logic";

const baseGate: CheckoutGateArgs = {
  authLoading: false,
  bookingLoading: false,
  hasSession: true,
  userId: "u1",
  code: "MP-ABC123",
  profile: { full_name: "Fulano", tax_id: "12345678900" },
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
      to: `/entrar?next=${encodeURIComponent("/checkout/MP-ABC123")}`,
    });
  });

  it("redireciona pra completar perfil quando falta full_name ou tax_id", () => {
    const semNome = resolveCheckoutGate({
      ...baseGate,
      profile: { full_name: null, tax_id: "123" },
    });
    expect(semNome).toEqual({
      kind: "redirect",
      to: `/account/complete-profile?next=${encodeURIComponent("/checkout/MP-ABC123")}`,
    });
    const semCpf = resolveCheckoutGate({
      ...baseGate,
      profile: { full_name: "Fulano", tax_id: null },
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

describe("isCheckoutExpired", () => {
  const now = new Date("2026-06-23T12:00:00Z");

  it("expira só reserva pendente passada do prazo", () => {
    expect(isCheckoutExpired("2026-06-23T11:59:00Z", "pending", now)).toBe(true);
  });

  it("não expira se o prazo é futuro", () => {
    expect(isCheckoutExpired("2026-06-23T12:01:00Z", "pending", now)).toBe(false);
  });

  it("não expira se a reserva não é pending", () => {
    expect(isCheckoutExpired("2026-06-23T11:00:00Z", "confirmed", now)).toBe(false);
  });

  it("sem expires_at nunca expira", () => {
    expect(isCheckoutExpired(null, "pending", now)).toBe(false);
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
