import { describe, expect, it } from "vitest";
import { isWithinCheckInWindow, voucherValidity } from "./voucher.logic";

const NOW = new Date("2026-10-10T12:00:00Z");

function booking(status: string, checkIn = "2026-10-10T12:00:00Z", checkedInAt: string | null = null) {
  return { status: status as never, check_in_at: checkIn, checked_in_at: checkedInAt };
}

describe("isWithinCheckInWindow", () => {
  it("aceita de -30min a +2h do check-in", () => {
    expect(isWithinCheckInWindow("2026-10-10T12:00:00Z", new Date("2026-10-10T11:35:00Z"))).toBe(true);
    expect(isWithinCheckInWindow("2026-10-10T12:00:00Z", new Date("2026-10-10T13:59:00Z"))).toBe(true);
  });
  it("rejeita antes de -30min e depois de +2h", () => {
    expect(isWithinCheckInWindow("2026-10-10T12:00:00Z", new Date("2026-10-10T11:00:00Z"))).toBe(false);
    expect(isWithinCheckInWindow("2026-10-10T12:00:00Z", new Date("2026-10-10T15:00:00Z"))).toBe(false);
  });
});

describe("voucherValidity", () => {
  it("not_found quando não há reserva", () => {
    const v = voucherValidity(null, NOW);
    expect(v.state).toBe("not_found");
    expect(v.canCheckIn).toBe(false);
    expect(v.tone).toBe("error");
  });

  it("confirmed dentro da janela → libera check-in (success)", () => {
    const v = voucherValidity(booking("confirmed"), NOW);
    expect(v.state).toBe("confirmed");
    expect(v.canCheckIn).toBe(true);
    expect(v.withinWindow).toBe(true);
    expect(v.tone).toBe("success");
  });

  it("confirmed fora da janela → ainda libera, mas avisa (warning)", () => {
    const v = voucherValidity(booking("confirmed", "2026-10-11T12:00:00Z"), NOW);
    expect(v.canCheckIn).toBe(true);
    expect(v.withinWindow).toBe(false);
    expect(v.tone).toBe("warning");
  });

  it("pending → não libera (aguardando pagamento)", () => {
    const v = voucherValidity(booking("pending"), NOW);
    expect(v.canCheckIn).toBe(false);
    expect(v.tone).toBe("warning");
  });

  it("checked_in → já registrada, sem novo check-in", () => {
    const v = voucherValidity(booking("checked_in", "2026-10-10T12:00:00Z", "2026-10-10T11:50:00Z"), NOW);
    expect(v.state).toBe("checked_in");
    expect(v.canCheckIn).toBe(false);
    expect(v.tone).toBe("success");
  });

  it.each(["cancelled", "no_show"])("%s → erro, sem check-in", (status) => {
    const v = voucherValidity(booking(status), NOW);
    expect(v.canCheckIn).toBe(false);
    expect(v.tone).toBe("error");
  });

  it("completed → info, sem check-in", () => {
    const v = voucherValidity(booking("completed"), NOW);
    expect(v.state).toBe("completed");
    expect(v.canCheckIn).toBe(false);
    expect(v.tone).toBe("info");
  });
});
