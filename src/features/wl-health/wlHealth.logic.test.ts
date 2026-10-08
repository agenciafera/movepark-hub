import { describe, expect, it } from "vitest";
import {
  bookingIdFromEventId,
  healthReasonLabel,
  importStatusView,
  isMirrorStale,
  isReconcileStale,
  mirrorStatusView,
  reconcileStatusView,
  shouldShowMirror,
} from "./wlHealth.logic";

describe("shouldShowMirror", () => {
  it("vale para qualquer vaga mapeada de empresa com site WL", () => {
    expect(shouldShowMirror({ hasWlSite: true, categorySlug: "c", productSlug: "p" })).toBe(true);
  });
  it("some sem site WL ou sem mapeamento completo", () => {
    expect(shouldShowMirror({ hasWlSite: false, categorySlug: "c", productSlug: "p" })).toBe(false);
    expect(shouldShowMirror({ hasWlSite: true, categorySlug: "c", productSlug: null })).toBe(false);
  });
});

describe("mirrorStatusView", () => {
  it("nunca conferida não é ok", () => {
    expect(mirrorStatusView(null).tone).toBe("muted");
    expect(mirrorStatusView({ mirror_status: "ok", mirror_verified_at: null }).tone).toBe("muted");
  });
  it("erro é erro, com a mensagem (regressão: aparecia como ok)", () => {
    const v = mirrorStatusView({
      mirror_status: "error",
      mirror_verified_at: "2026-10-06T19:00:00Z",
      mirror_error: "WL calculation-price 400",
    });
    expect(v).toEqual({
      label: "erro na última conferência",
      tone: "error",
      detail: "WL calculation-price 400",
    });
  });
  it("divergente e ok", () => {
    expect(mirrorStatusView({ mirror_status: "divergent", mirror_verified_at: "x" }).label).toBe(
      "divergente",
    );
    expect(mirrorStatusView({ mirror_status: "ok", mirror_verified_at: "x" }).tone).toBe("ok");
  });
});

describe("frescor", () => {
  const now = new Date("2026-10-08T12:00:00Z");
  it("espelho passa de 24h", () => {
    expect(isMirrorStale("2026-10-07T13:00:00Z", now)).toBe(false);
    expect(isMirrorStale("2026-10-06T19:00:00Z", now)).toBe(true);
    expect(isMirrorStale(null, now)).toBe(true);
  });
  it("reconciliação passa de 2h", () => {
    expect(isReconcileStale("2026-10-08T11:00:00Z", now)).toBe(false);
    expect(isReconcileStale("2026-10-08T09:30:00Z", now)).toBe(true);
    expect(isReconcileStale(undefined, now)).toBe(true);
  });
});

describe("textos e ids", () => {
  it("motivo desconhecido não some", () => {
    expect(healthReasonLabel("xyz")).toContain("xyz");
    expect(healthReasonLabel("entrega_falhou")).toMatch(/recusou um envio/);
  });
  it("tira versão e operação do event_id", () => {
    expect(bookingIdFromEventId("abc#2:reserve")).toBe("abc");
    expect(bookingIdFromEventId("abc:release")).toBe("abc");
  });
});

describe("reconcileStatusView", () => {
  const now = new Date("2026-10-08T12:00:00Z");
  const base = {
    reconcile_expected: true,
    reconciled_at: "2026-10-08T11:45:00Z",
    reconcile_error: null,
    reconcile_error_at: null,
  };
  it("sync desligado não é problema", () => {
    expect(reconcileStatusView({ ...base, reconcile_expected: false }, now).tone).toBe("muted");
  });
  it("em dia, atrasada e nunca lida", () => {
    expect(reconcileStatusView(base, now).label).toBe("em dia");
    expect(reconcileStatusView({ ...base, reconciled_at: "2026-10-08T08:00:00Z" }, now).label).toBe(
      "atrasada",
    );
    expect(reconcileStatusView({ ...base, reconciled_at: null }, now).label).toBe("atrasada");
  });
  it("erro só conta se veio depois da última leitura boa", () => {
    const erro = { reconcile_error: "WL availability 404", reconcile_error_at: "2026-10-08T11:50:00Z" };
    expect(reconcileStatusView({ ...base, ...erro }, now)).toEqual({
      label: "erro",
      tone: "error",
      detail: "WL availability 404",
    });
    expect(
      reconcileStatusView({ ...base, ...erro, reconcile_error_at: "2026-10-08T10:00:00Z" }, now).label,
    ).toBe("em dia");
  });
});

describe("importStatusView", () => {
  const now = new Date("2026-10-08T12:00:00Z");
  const ok = { last_ok_at: "2026-10-08T11:50:00Z", last_error: null, last_error_at: null };
  it("desligada não é problema", () => {
    expect(importStatusView(ok, false, now).tone).toBe("muted");
  });
  it("em dia, atrasada, erro depois da leitura boa", () => {
    expect(importStatusView(ok, true, now).label).toBe("em dia");
    expect(importStatusView({ ...ok, last_ok_at: null }, true, now).label).toBe("atrasada");
    expect(
      importStatusView({ ...ok, last_error: "WL orders 404", last_error_at: "2026-10-08T11:55:00Z" }, true, now),
    ).toEqual({ label: "erro", tone: "error", detail: "WL orders 404" });
  });
});
