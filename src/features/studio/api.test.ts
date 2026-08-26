import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn();
vi.mock("@/lib/supabase", () => ({ supabase: { functions: { invoke } } }));

const { abrirStudio, fetchStudioLink } = await import("./api");

describe("link do Studio", () => {
  beforeEach(() => {
    invoke.mockReset();
    vi.unstubAllGlobals();
  });

  it("devolve a url que a Edge respondeu", async () => {
    invoke.mockResolvedValue({ data: { url: "https://studio.exemplo/?auth_header=Bearer%20x" }, error: null });
    await expect(fetchStudioLink()).resolves.toContain("auth_header=");
  });

  it("falha quando o Studio não está configurado", async () => {
    invoke.mockResolvedValue({ data: {}, error: null });
    await expect(fetchStudioLink()).rejects.toThrow(/não configurado/i);
  });

  it("abre a aba ANTES de esperar a resposta", async () => {
    // Se `window.open` fosse chamado depois do await, o bloqueador de pop-up mataria a
    // aba: ela deixaria de estar ligada ao clique. Este teste trava essa ordem.
    const aba = { location: { href: "" }, close: vi.fn() };
    const open = vi.fn(() => aba);
    vi.stubGlobal("window", { ...globalThis.window, open });

    let liberar!: (v: unknown) => void;
    invoke.mockReturnValue(new Promise((ok) => (liberar = ok)));

    const promessa = abrirStudio();
    expect(open).toHaveBeenCalledTimes(1); // já abriu, sem resposta ainda
    expect(aba.location.href).toBe("");

    liberar({ data: { url: "https://studio.exemplo/?auth_header=Bearer%20x" }, error: null });
    await promessa;
    expect(aba.location.href).toContain("studio.exemplo");
  });

  it("fecha a aba quando a Edge recusa", async () => {
    const aba = { location: { href: "" }, close: vi.fn() };
    vi.stubGlobal("window", { ...globalThis.window, open: vi.fn(() => aba) });
    invoke.mockResolvedValue({ data: null, error: new Error("Acesso restrito.") });

    await expect(abrirStudio()).rejects.toThrow();
    expect(aba.close).toHaveBeenCalled(); // aba em branco não fica órfã
  });
});
