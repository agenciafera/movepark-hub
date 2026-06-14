import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assertPublicImage,
  imageSrcSet,
  isTransformableAsset,
  optimizedImageUrl,
  publicAssetDir,
  PUBLIC_IMAGE_ACCEPT,
  uploadCompanyAsset,
  uploadPublicAsset,
} from "./storage";
import { supabase } from "./supabase";

const STORAGE_URL =
  "https://proj.supabase.co/storage/v1/object/public/assets-public/destinations/GRU/hero-abc.png";

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

describe("optimizedImageUrl", () => {
  it("reescreve URL do Storage para o endpoint de transform com os params", () => {
    const out = optimizedImageUrl(STORAGE_URL, { width: 1024, quality: 70 });
    expect(out).toContain("/storage/v1/render/image/public/");
    expect(out).not.toContain("/storage/v1/object/public/");
    expect(out).toContain("width=1024");
    expect(out).toContain("quality=70");
  });

  it("inclui resize quando informado", () => {
    expect(optimizedImageUrl(STORAGE_URL, { width: 1200, height: 630, resize: "cover" })).toContain(
      "resize=cover",
    );
  });

  it("não altera URL externa (colada) nem retorna undefined p/ vazio", () => {
    expect(optimizedImageUrl("https://cdn.externo/x.jpg", { width: 100 })).toBe(
      "https://cdn.externo/x.jpg",
    );
    expect(optimizedImageUrl(null)).toBeUndefined();
  });
});

describe("isTransformableAsset", () => {
  it("distingue objeto do Storage de URL externa", () => {
    expect(isTransformableAsset(STORAGE_URL)).toBe(true);
    expect(isTransformableAsset("https://cdn.externo/x.jpg")).toBe(false);
    expect(isTransformableAsset(null)).toBe(false);
  });
});

describe("uploadPublicAsset", () => {
  afterEach(() => vi.restoreAllMocks());

  function mockSession(token: string | null) {
    vi.spyOn(supabase.auth, "getSession").mockResolvedValue({
      // shape parcial — só usamos access_token
      data: { session: token ? ({ access_token: token } as never) : null },
      error: null,
    } as never);
  }

  it("envia multipart pra Edge upload-asset com Bearer e devolve a URL", async () => {
    mockSession("jwt-123");
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ url: "https://cdn/x.png" }), { status: 201 }),
    );

    const url = await uploadCompanyAsset("comp-1", "photo", fakeFile("a.png", "image/png"));

    expect(url).toBe("https://cdn/x.png");
    expect(fetchSpy).toHaveBeenCalledOnce();
    const [calledUrl, init] = fetchSpy.mock.calls[0];
    expect(String(calledUrl)).toMatch(/\/functions\/v1\/upload-asset$/);
    const headers = (init?.headers ?? {}) as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer jwt-123");
    const body = init?.body as FormData;
    expect(body.get("dir")).toBe("comp-1");
    expect(body.get("name")).toBe("photo");
    expect(body.get("file")).toBeInstanceOf(File);
  });

  it("sem sessão → erro pedindo login (não chama a rede)", async () => {
    mockSession(null);
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await expect(uploadPublicAsset("comp-1", "photo", fakeFile("a.png", "image/png"))).rejects.toThrow(
      /entrar/i,
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("propaga a mensagem de erro da Edge", async () => {
    mockSession("jwt-123");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "Sem acesso a esta empresa." }), { status: 403 }),
    );
    await expect(
      uploadCompanyAsset("outra", "photo", fakeFile("a.png", "image/png")),
    ).rejects.toThrow(/Sem acesso/);
  });

  it("valida o arquivo antes de chamar a rede", async () => {
    mockSession("jwt-123");
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await expect(
      uploadCompanyAsset("comp-1", "photo", fakeFile("a.pdf", "application/pdf")),
    ).rejects.toThrow(/Formato/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("imageSrcSet", () => {
  it("monta srcset com descritores w para imagem do Storage", () => {
    const set = imageSrcSet(STORAGE_URL, [640, 1024]);
    expect(set).toContain("width=640");
    expect(set).toContain("640w");
    expect(set).toContain("1024w");
    expect(set).toContain("/render/image/public/");
  });

  it("retorna undefined p/ URL externa (sem transform)", () => {
    expect(imageSrcSet("https://cdn.externo/x.jpg", [640])).toBeUndefined();
  });
});
