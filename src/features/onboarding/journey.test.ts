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
  it("recém-publicado sem recebimento nem foto: fase atual = recebimento", () => {
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

  it("recebedor ativo mas sem foto: fase atual = fotos", () => {
    const j = deriveJourney({ ...base, recipientStatus: "active" });
    expect(j.current).toBe("fotos");
    expect(j.completed).toEqual(["preview", "recebimento"]);
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
    expect(j.completed).toEqual(["preview", "recebimento", "fotos", "vender"]);
  });

  it("foto feita antes do recebimento: fotos concluída, recebimento ainda atual", () => {
    const j = deriveJourney({ ...base, hasPhotos: true });
    expect(j.current).toBe("recebimento");
    expect(j.completed).toContain("fotos");
    expect(j.complete).toBe(false);
  });
});
