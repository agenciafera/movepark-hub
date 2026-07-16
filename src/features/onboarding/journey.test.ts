import { describe, it, expect } from "vitest";
import { deriveJourney } from "./journey";

describe("deriveJourney", () => {
  it("recém-publicado sem recebimento nem foto: fase atual = recebimento", () => {
    const j = deriveJourney({ loading: false, hasPublished: true, recipientStatus: null, hasPhotos: false });
    expect(j.current).toBe("recebimento");
    expect(j.completed).toEqual(["publicar"]);
    expect(j.complete).toBe(false);
  });

  it("recebimento em análise fica pendente e ainda é a fase atual", () => {
    const j = deriveJourney({ loading: false, hasPublished: true, recipientStatus: "pending", hasPhotos: false });
    expect(j.current).toBe("recebimento");
    expect(j.recebimentoPending).toBe(true);
    expect(j.canReceive).toBe(false);
  });

  it("recebedor ativo mas sem foto: fase atual = fotos", () => {
    const j = deriveJourney({ loading: false, hasPublished: true, recipientStatus: "active", hasPhotos: false });
    expect(j.current).toBe("fotos");
    expect(j.completed).toEqual(["publicar", "recebimento"]);
  });

  it("tudo pronto: jornada completa", () => {
    const j = deriveJourney({ loading: false, hasPublished: true, recipientStatus: "active", hasPhotos: true });
    expect(j.complete).toBe(true);
    expect(j.completed).toEqual(["publicar", "recebimento", "fotos"]);
  });

  it("foto feita antes do recebimento: fotos concluída, recebimento ainda atual", () => {
    const j = deriveJourney({ loading: false, hasPublished: true, recipientStatus: null, hasPhotos: true });
    expect(j.current).toBe("recebimento");
    expect(j.completed).toContain("fotos");
    expect(j.complete).toBe(false);
  });
});
