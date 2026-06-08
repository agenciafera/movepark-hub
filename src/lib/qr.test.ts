import { describe, expect, it } from "vitest";
import { toDataUrl, toSvgString } from "./qr";

describe("qr", () => {
  it("toSvgString gera SVG com a cor da marca", async () => {
    const svg = await toSvgString("MP-ABC123");
    expect(svg).toContain("<svg");
    expect(svg).toContain("</svg>");
    // dark color configurado (#29263F)
    expect(svg.toUpperCase()).toContain("29263F");
  });

  it("toDataUrl gera PNG base64", async () => {
    const url = await toDataUrl("MP-ABC123");
    expect(url).toMatch(/^data:image\/png;base64,/);
  });
});
