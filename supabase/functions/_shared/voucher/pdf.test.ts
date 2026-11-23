import { assert, assertEquals } from "jsr:@std/assert";
import { buildVoucherPdf, fetchLogoImage, isOwnStorageUrl, linhasDoAviso, logoKind, wrapText } from "./pdf.ts";
import type { VoucherBooking } from "./fields.ts";

Deno.env.set("SUPABASE_URL", "https://proj.supabase.co");
const LOGO = "https://proj.supabase.co/storage/v1/object/public/assets-public/c1/logo-x.png";

// PNG 1×1 válido.
const PNG_1PX = Uint8Array.from(
  atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="),
  (c) => c.charCodeAt(0),
);

const base: VoucherBooking = {
  code: "MP-LOGO01",
  check_in_at: "2026-12-01T13:00:00Z",
  check_out_at: "2026-12-05T13:00:00Z",
  total_amount: 200,
  currency: "BRL",
  company_name: "Pare Seguro",
  location_name: "Aeroporto de Guarulhos",
  location_address: "Rua A, 1",
  parking_type_name: "Vaga coberta",
  vehicle: null,
};

function stubFetch(impl: (url: string) => Promise<Response>) {
  const original = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = ((input: string | URL | Request) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    calls.push(url);
    return impl(url);
  }) as typeof fetch;
  return { calls, restore: () => (globalThis.fetch = original) };
}

Deno.test("logoKind reconhece PNG e JPG pela assinatura, e recusa o resto", () => {
  assertEquals(logoKind(PNG_1PX), "png");
  assertEquals(logoKind(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0])), "jpg");
  assertEquals(logoKind(new TextEncoder().encode("<svg></svg>")), null);
});

Deno.test("fetchLogoImage: só https, e falha vira null em vez de erro", async () => {
  assertEquals(await fetchLogoImage(null), null);
  assertEquals(await fetchLogoImage("http://inseguro/logo.png"), null);
  const f = stubFetch(() => Promise.reject(new Error("rede caiu")));
  try {
    assertEquals(await fetchLogoImage(LOGO), null);
  } finally {
    f.restore();
  }
});

Deno.test("buildVoucherPdf com logo: baixa a versão para fundo claro e embute", async () => {
  const f = stubFetch(() => Promise.resolve(new Response(PNG_1PX, { status: 200 })));
  try {
    const sem = await buildVoucherPdf(base, "https://movepark.co/voucher/validate?code=MP-LOGO01");
    const com = await buildVoucherPdf(
      { ...base, parking_logo: { light: LOGO, dark: "https://cdn.test/ps-b.png" } },
      "https://movepark.co/voucher/validate?code=MP-LOGO01",
    );
    assertEquals(f.calls, [LOGO]);
    // O PDF com logo carrega imagem a mais que o QR sozinho (PNG com transparência vira duas:
    // a imagem e a máscara alfa).
    const imagens = (b: Uint8Array) => (new TextDecoder("latin1").decode(b).match(/\/Subtype \/Image/g) ?? []).length;
    assertEquals(imagens(sem), 1);
    assert(imagens(com) > imagens(sem));
  } finally {
    f.restore();
  }
});

Deno.test("buildVoucherPdf: logo que não baixa não segura o voucher", async () => {
  const f = stubFetch(() => Promise.resolve(new Response("nope", { status: 404 })));
  try {
    const pdf = await buildVoucherPdf(
      { ...base, parking_logo: { light: LOGO.replace("logo-x", "sumiu"), dark: null } },
      "https://movepark.co/voucher/validate?code=MP-LOGO01",
    );
    assert(pdf.length > 1000);
  } finally {
    f.restore();
  }
});

Deno.test("isOwnStorageUrl: só o Storage público deste projeto", () => {
  assertEquals(isOwnStorageUrl(LOGO), true);
  assertEquals(isOwnStorageUrl("https://outro.supabase.co/storage/v1/object/public/a.png"), false);
  assertEquals(isOwnStorageUrl("https://proj.supabase.co/rest/v1/company"), false);
  assertEquals(isOwnStorageUrl("http://proj.supabase.co/storage/v1/object/public/a.png"), false);
  assertEquals(isOwnStorageUrl("https://169.254.169.254/latest/meta-data.png"), false);
});

Deno.test("buildVoucherPdf: logo fora do Storage do projeto nem é baixado", async () => {
  const f = stubFetch(() => Promise.resolve(new Response(PNG_1PX, { status: 200 })));
  try {
    await buildVoucherPdf(
      { ...base, parking_logo: { light: "https://interno.exemplo/logo.png", dark: null } },
      "https://movepark.co/voucher/validate?code=MP-LOGO01",
    );
    assertEquals(f.calls, []);
  } finally {
    f.restore();
  }
});

Deno.test("wrapText: endereço longo quebra por palavra e nenhuma linha passa do limite", () => {
  const medir = (t: string) => t.length * 6;
  const rows = wrapText("Av. Monteiro Lobato, 2738 - Vila Miriam, Guarulhos - SP, 07190-000", 200, medir);
  assertEquals(rows.length > 1, true);
  for (const r of rows) assertEquals(medir(r) <= 200, true);
  assertEquals(rows.join(" "), "Av. Monteiro Lobato, 2738 - Vila Miriam, Guarulhos - SP, 07190-000");
  assertEquals(wrapText("Curto", 200, medir), ["Curto"]);
});

Deno.test("linhasDoAviso: Markdown restrito vira linhas de texto puro que cabem na folha", () => {
  const medir = (t: string) => t.length * 6;
  const linhas = linhasDoAviso(
    "**Malas extras são cobradas pelo estacionamento.**\n- Acima do limite, taxa por mala, paga na chegada ao estacionamento, direto no pátio\n- Veja as [regras](https://exemplo.com/r) 🧳",
    400,
    medir,
  );
  assertEquals(linhas[0], "Malas extras são cobradas pelo estacionamento.");
  assert(linhas.length > 3, "item longo quebra em mais de uma linha");
  for (const l of linhas) assert(medir(l) <= 400 || !l.includes(" "), `linha larga: ${l}`);
  assertEquals(linhas.some((l) => l.includes("🧳")), false, "emoji fora do WinAnsi sai");
  assertEquals(linhas.at(-1), "• Veja as regras (https://exemplo.com/r)");
  assertEquals(linhasDoAviso(null, 400, medir), []);
  assertEquals(linhasDoAviso("  \n", 400, medir), []);
});

Deno.test("buildVoucherPdf: com aviso o PDF ganha o bloco; sem aviso fica como era", async () => {
  const qr = "https://movepark.co/voucher/validate?code=MP-LOGO01";
  const sem = await buildVoucherPdf(base, qr);
  const com = await buildVoucherPdf(
    { ...base, partner_notice_md: "**Malas extras** são cobradas pelo estacionamento.\n- Taxa por mala acima do limite" },
    qr,
  );
  // O texto do PDF sai comprimido; o que dá para medir sem decodificar é o tamanho e a diferença.
  assert(com.length > sem.length, "o aviso acrescenta conteúdo ao PDF");
  const semVazio = await buildVoucherPdf({ ...base, partner_notice_md: "  \n " }, qr);
  assert(Math.abs(semVazio.length - sem.length) < 64, "aviso vazio não desenha bloco");
});
