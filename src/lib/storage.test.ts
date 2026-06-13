import { describe, expect, it } from "vitest";
import { assertPublicImage, publicAssetDir, PUBLIC_IMAGE_ACCEPT } from "./storage";

function fakeFile(name: string, type: string, size = 1024): File {
  const f = new File(["x"], name, { type });
  Object.defineProperty(f, "size", { value: size });
  return f;
}

describe("assertPublicImage", () => {
  it("aceita imagem válida dentro do limite", () => {
    expect(() => assertPublicImage(fakeFile("a.png", "image/png", 1024))).not.toThrow();
    expect(() => assertPublicImage(fakeFile("a.webp", "image/webp", 5_000))).not.toThrow();
  });

  it("rejeita mime que não é imagem", () => {
    expect(() => assertPublicImage(fakeFile("a.pdf", "application/pdf"))).toThrow(/Formato/);
  });

  it("rejeita acima de 10 MB", () => {
    expect(() => assertPublicImage(fakeFile("a.png", "image/png", 11 * 1024 * 1024))).toThrow(
      /10 MB/,
    );
  });
});

describe("publicAssetDir", () => {
  it("monta os paths pela convenção do bucket", () => {
    expect(publicAssetDir.company("comp-1")).toBe("comp-1");
    expect(publicAssetDir.destination("GRU")).toBe("destinations/GRU");
    expect(publicAssetDir.blog("meu-post")).toBe("blog/meu-post");
  });
});

describe("PUBLIC_IMAGE_ACCEPT", () => {
  it("reflete os mimes aceitos pelo bucket", () => {
    expect(PUBLIC_IMAGE_ACCEPT).toContain("image/webp");
    expect(PUBLIC_IMAGE_ACCEPT).toContain("image/svg+xml");
  });
});
