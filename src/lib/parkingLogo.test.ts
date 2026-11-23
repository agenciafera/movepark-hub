import { describe, expect, it } from "vitest";
import { prepareLogoFile, resolveParkingLogo } from "./parkingLogo";

const A = "https://cdn.test/a.png";
const B = "https://cdn.test/b.png";
const C = "https://cdn.test/c.jpg";

describe("resolveParkingLogo", () => {
  it("sem logo em lugar nenhum, devolve nulo nos dois fundos", () => {
    expect(resolveParkingLogo(null, null)).toEqual({ light: null, dark: null });
    expect(resolveParkingLogo({}, { logo_url: "  " })).toEqual({ light: null, dark: null });
  });

  it("a unidade sem logo segue a empresa", () => {
    expect(resolveParkingLogo({ logo_url: null }, { logo_url: A, logo_dark_url: B })).toEqual({
      light: A,
      dark: B,
    });
  });

  it("o logo da unidade troca o da empresa, fundo por fundo", () => {
    expect(resolveParkingLogo({ logo_url: C }, { logo_url: A, logo_dark_url: B })).toEqual({
      light: C,
      dark: B,
    });
    expect(resolveParkingLogo({ logo_url: C }, { logo_url: A })).toEqual({ light: C, dark: C });
  });

  it("o escuro cai no colorido (a tela pinta de branco); o claro nunca usa o branco", () => {
    expect(resolveParkingLogo(null, { logo_url: A })).toEqual({ light: A, dark: A });
    expect(resolveParkingLogo(null, { logo_dark_url: B })).toEqual({ light: null, dark: B });
  });
});

describe("prepareLogoFile", () => {
  it("põe a extensão certa no nome, mesmo quando o arquivo veio sem", () => {
    const f = prepareLogoFile(new File(["x"], "marca", { type: "image/png" }));
    expect(f.name).toBe("logo.png");
    expect(f.type).toBe("image/png");
    expect(prepareLogoFile(new File(["x"], "marca.jpeg", { type: "image/jpeg" })).name).toBe(
      "logo.jpg",
    );
  });

  it("recusa SVG e WebP, que somem no e-mail ou no voucher", () => {
    expect(() => prepareLogoFile(new File(["x"], "a.svg", { type: "image/svg+xml" }))).toThrow(
      /PNG ou JPG/,
    );
    expect(() => prepareLogoFile(new File(["x"], "a.webp", { type: "image/webp" }))).toThrow(
      /PNG ou JPG/,
    );
  });

  it("recusa arquivo acima de 2 MB", () => {
    const big = new File([new Uint8Array(2 * 1024 * 1024 + 1)], "a.png", { type: "image/png" });
    expect(() => prepareLogoFile(big)).toThrow(/2 MB/);
  });
});
