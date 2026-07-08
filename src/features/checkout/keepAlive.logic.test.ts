import { describe, expect, it } from "vitest";
import { keepAliveState, KEEP_ALIVE_THRESHOLD_SEC } from "./keepAlive.logic";

const T0 = Date.parse("2026-07-08T12:00:00Z");
const min = (n: number) => n * 60_000;

describe("keepAliveState", () => {
  it("hidden quando não pendente", () => {
    expect(
      keepAliveState({ status: "confirmed", expiresAt: new Date(T0 + min(2)).toISOString(), createdAt: new Date(T0).toISOString(), nowMs: T0 }),
    ).toBe("hidden");
  });

  it("hidden quando ainda falta mais que o limiar (5 min)", () => {
    const expiresAt = new Date(T0 + KEEP_ALIVE_THRESHOLD_SEC * 1000 + min(1)).toISOString();
    expect(keepAliveState({ status: "pending", expiresAt, createdAt: new Date(T0).toISOString(), nowMs: T0 })).toBe("hidden");
  });

  it("warning dentro do limiar e dentro do teto", () => {
    const expiresAt = new Date(T0 + min(3)).toISOString(); // 3 min p/ expirar
    const createdAt = new Date(T0 - min(27)).toISOString(); // criada há 27 min (teto 90 longe)
    expect(keepAliveState({ status: "pending", expiresAt, createdAt, nowMs: T0 })).toBe("warning");
  });

  it("cap quando o teto (created_at + 90) já passou", () => {
    const expiresAt = new Date(T0 + min(3)).toISOString();
    const createdAt = new Date(T0 - min(91)).toISOString(); // criada há 91 min → passou do teto de 90
    expect(keepAliveState({ status: "pending", expiresAt, createdAt, nowMs: T0 })).toBe("cap");
  });

  it("respeita um teto customizado (maxMinutes)", () => {
    const expiresAt = new Date(T0 + min(3)).toISOString();
    const createdAt = new Date(T0 - min(50)).toISOString(); // criada há 50 min
    // teto 45 → já passou → cap; teto 90 → ainda dentro → warning
    expect(keepAliveState({ status: "pending", expiresAt, createdAt, nowMs: T0, maxMinutes: 45 })).toBe("cap");
    expect(keepAliveState({ status: "pending", expiresAt, createdAt, nowMs: T0, maxMinutes: 90 })).toBe("warning");
  });

  it("expired quando já passou de expires_at", () => {
    const expiresAt = new Date(T0 - min(1)).toISOString();
    expect(keepAliveState({ status: "pending", expiresAt, createdAt: new Date(T0 - min(30)).toISOString(), nowMs: T0 })).toBe("expired");
  });

  it("hidden sem expires_at", () => {
    expect(keepAliveState({ status: "pending", expiresAt: null, createdAt: null, nowMs: T0 })).toBe("hidden");
  });
});
