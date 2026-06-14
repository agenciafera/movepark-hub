import { assertEquals, assertMatch } from "jsr:@std/assert";
import { buildObjectPath, classifyDir, extOf, sanitizeName, validateImage } from "./logic.ts";

const CID = "8a4e2589-996c-4aef-a797-a5f3632eed82";

Deno.test("classifyDir: company_id puro → scope company", () => {
  const r = classifyDir(CID);
  assertEquals(r, { ok: true, target: { scope: "company", companyId: CID } });
});

Deno.test("classifyDir: destinations/<slug> → scope destination", () => {
  const r = classifyDir("destinations/gru");
  assertEquals(r.ok && r.target.scope, "destination");
});

Deno.test("classifyDir: blog/<slug> → scope blog", () => {
  const r = classifyDir("blog/lancamento");
  assertEquals(r.ok && r.target.scope, "blog");
});

Deno.test("classifyDir: trim de barras nas pontas", () => {
  const r = classifyDir(`/${CID}/`);
  assertEquals(r.ok && r.target.scope, "company");
});

Deno.test("classifyDir: path traversal → erro", () => {
  assertEquals(classifyDir("destinations/../blog").ok, false);
  assertEquals(classifyDir(`${CID}/..`).ok, false);
});

Deno.test("classifyDir: company_id com subpath não é aceito (evita escopo cruzado)", () => {
  // só o company_id puro vira escopo de empresa; subpastas livres não.
  assertEquals(classifyDir(`${CID}/sub`).ok, false);
});

Deno.test("classifyDir: vazio / inválido → erro", () => {
  assertEquals(classifyDir("").ok, false);
  assertEquals(classifyDir("qualquer-coisa").ok, false);
});

Deno.test("validateImage: mime fora da lista → erro", () => {
  const r = validateImage({ type: "application/pdf", size: 100 });
  assertEquals(r.ok, false);
});

Deno.test("validateImage: acima de 10MB → erro", () => {
  const r = validateImage({ type: "image/png", size: 11 * 1024 * 1024 });
  assertEquals(r.ok, false);
});

Deno.test("validateImage: vazio → erro", () => {
  assertEquals(validateImage({ type: "image/png", size: 0 }).ok, false);
});

Deno.test("validateImage: png válido → ok", () => {
  assertEquals(validateImage({ type: "image/png", size: 1234 }).ok, true);
});

Deno.test("extOf / sanitizeName", () => {
  assertEquals(extOf("Image from Google Drive (2).jpg"), "jpg");
  assertEquals(extOf("semponto"), "semponto"); // sem ponto: o nome inteiro é a "extensão"
  assertEquals(extOf("arquivo."), "bin"); // termina em ponto → vazio → fallback
  assertEquals(sanitizeName("Foto Principal!"), "foto-principal");
});

Deno.test("buildObjectPath: <dir>/<name>-<rand>.<ext>", () => {
  const p = buildObjectPath(CID, "photo", "Foo.JPG", "ah1wolw");
  assertEquals(p, `${CID}/photo-ah1wolw.jpg`);
});

Deno.test("buildObjectPath: nome sujo é saneado", () => {
  const p = buildObjectPath("destinations/gru", "Hero Banner", "x.webp", "abc1234");
  assertMatch(p, /^destinations\/gru\/hero-banner-abc1234\.webp$/);
});
