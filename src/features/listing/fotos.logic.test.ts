import { describe, expect, it } from "vitest";
import { fotosDaUnidade, galeriaDaFicha } from "./fotos.logic";

describe("galeriaDaFicha", () => {
  it("abre com as fotos do tipo de vaga e segue com as da unidade", () => {
    expect(galeriaDaFicha(["/descoberta-1.avif", "/descoberta-2.avif"], ["/fachada.avif"])).toEqual(
      ["/descoberta-1.avif", "/descoberta-2.avif", "/fachada.avif"],
    );
  });

  it("sem foto do tipo, fica a galeria da unidade", () => {
    expect(galeriaDaFicha([], ["/fachada.avif", "/recepcao.avif"])).toEqual([
      "/fachada.avif",
      "/recepcao.avif",
    ]);
    expect(galeriaDaFicha(undefined, ["/fachada.avif"])).toEqual(["/fachada.avif"]);
  });

  it("foto repetida aparece uma vez, na posição do tipo", () => {
    expect(galeriaDaFicha(["/toldo.avif"], ["/fachada.avif", "/toldo.avif"])).toEqual([
      "/toldo.avif",
      "/fachada.avif",
    ]);
  });

  it("descarta entrada vazia", () => {
    expect(galeriaDaFicha(["", "  "], [null as unknown as string, "/fachada.avif"])).toEqual([
      "/fachada.avif",
    ]);
  });
});

describe("fotosDaUnidade", () => {
  it("junta a unidade e todos os tipos, sem repetir", () => {
    expect(
      fotosDaUnidade(
        ["/fachada.avif"],
        [{ photos: ["/descoberta.avif"] }, { photos: ["/toldo.avif", "/fachada.avif"] }, {}],
      ),
    ).toEqual(["/fachada.avif", "/descoberta.avif", "/toldo.avif"]);
  });
});
