// Teste dos branches de validação. Validar aqui, e não deixar a Meta recusar,
// importa porque o carrossel cria N containers antes do publish: falhar no
// sétimo deixaria seis containers órfãos pendurados na conta por 24h.
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { autorizado, ehCarrossel, LIMITES, validar } from "./logic.ts";

const img = (n: number) => ({
  url: `https://exemplo.co/slide-${n}.jpg`,
  alt: `pátio de estacionamento no aeroporto de Confins, slide ${n}`,
});

Deno.test("payload bom passa sem erro", () => {
  assertEquals(validar({ caption: "Legenda válida. #confins", images: [img(1)] }), []);
});

Deno.test("caption vazia é recusada", () => {
  const e = validar({ caption: "   ", images: [img(1)] });
  assertEquals(e.includes("caption vazia"), true);
});

Deno.test("caption acima de 2200 é recusada", () => {
  const e = validar({ caption: "a".repeat(LIMITES.legenda + 1), images: [img(1)] });
  assertEquals(e.some((m) => m.includes("2200")), true);
});

Deno.test("mais de 30 hashtags é recusado", () => {
  const caption = "texto " + Array.from({ length: 31 }, (_, i) => `#tag${i}`).join(" ");
  assertEquals(validar({ caption, images: [img(1)] }).some((m) => m.includes("hashtags")), true);
});

Deno.test("hashtag com acento conta (a regex é unicode)", () => {
  const caption = "texto " + Array.from({ length: 31 }, (_, i) => `#tagáç${i}`).join(" ");
  assertEquals(validar({ caption, images: [img(1)] }).some((m) => m.includes("31 hashtags")), true);
});

Deno.test("mais de 20 menções é recusado", () => {
  const caption = "oi " + Array.from({ length: 21 }, (_, i) => `@perfil${i}`).join(" ");
  assertEquals(validar({ caption, images: [img(1)] }).some((m) => m.includes("menções")), true);
});

Deno.test("carrossel acima de 10 slides é recusado", () => {
  const images = Array.from({ length: 11 }, (_, i) => img(i));
  assertEquals(validar({ caption: "ok", images }).some((m) => m.includes("limite do carrossel")), true);
});

Deno.test("sem imagem é recusado", () => {
  assertEquals(validar({ caption: "ok", images: [] }).includes("nenhuma imagem"), true);
});

Deno.test("imagem http é recusada, porque a Meta só busca https", () => {
  const e = validar({ caption: "ok", images: [{ url: "http://exemplo.co/a.jpg" }] });
  assertEquals(e.some((m) => m.includes("não é https")), true);
});

Deno.test("imagem que não é jpg é recusada", () => {
  const e = validar({ caption: "ok", images: [{ url: "https://exemplo.co/a.webp" }] });
  assertEquals(e.some((m) => m.includes("JPEG")), true);
});

Deno.test("jpg com query string continua valendo", () => {
  assertEquals(validar({ caption: "ok", images: [{ url: "https://exemplo.co/a.jpg?v=2" }] }), []);
});

Deno.test("alt acima de 1000 é recusado", () => {
  const e = validar({ caption: "ok", images: [{ url: "https://e.co/a.jpg", alt: "x".repeat(1001) }] });
  assertEquals(e.some((m) => m.includes("alt da imagem 1")), true);
});

Deno.test("ehCarrossel separa post único de carrossel", () => {
  assertEquals(ehCarrossel([1]), false);
  assertEquals(ehCarrossel([1, 2]), true);
});

Deno.test("autorizado exige a chave configurada e igual", () => {
  assertEquals(autorizado("segredo", "segredo"), true);
  assertEquals(autorizado("segredo", "outro"), false);
  assertEquals(autorizado(undefined, "qualquer"), false);
  assertEquals(autorizado(undefined, null), false);
});
