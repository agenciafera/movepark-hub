import { describe, it, expect } from "vitest";
import { deriveJourney } from "./journey";

const base = {
  loading: false,
  hasPublished: true,
  recipientStatus: null as string | null,
  hasPhotos: false,
  isListed: false,
};

describe("deriveJourney", () => {
  it("publicado sem recebimento: fase atual = recebimento", () => {
    const j = deriveJourney(base);
    expect(j.current).toBe("recebimento");
    expect(j.completed).toEqual(["preview"]);
    expect(j.complete).toBe(false);
  });

  it("recebimento em análise fica pendente e ainda é a fase atual", () => {
    const j = deriveJourney({ ...base, recipientStatus: "pending" });
    expect(j.current).toBe("recebimento");
    expect(j.recebimentoPending).toBe(true);
    expect(j.canReceive).toBe(false);
  });

  it("recebedor ativo mas ainda não no ar (falta foto): fase atual = vender", () => {
    const j = deriveJourney({ ...base, recipientStatus: "active" });
    expect(j.current).toBe("vender");
    expect(j.completed).toEqual(["preview", "recebimento"]);
    expect(j.complete).toBe(false);
    // o banner usa hasPhotos pra decidir o nudge de foto na fase vender
    expect(j.hasPhotos).toBe(false);
  });

  it("no ar (is_listed): jornada completa em Publicar/Vender", () => {
    const j = deriveJourney({
      ...base,
      recipientStatus: "active",
      hasPhotos: true,
      isListed: true,
    });
    expect(j.complete).toBe(true);
    expect(j.current).toBe("vender");
    expect(j.completed).toEqual(["preview", "recebimento", "vender"]);
  });
});
