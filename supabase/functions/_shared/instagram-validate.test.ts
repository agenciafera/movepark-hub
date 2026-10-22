// A conferência que o servidor repete antes de um post entrar na fila do Instagram (E3.6).
// Cada bloqueio aqui é algo que quebraria a publicação na Meta ou a marca da Movepark.
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { conferirImagem, conferirStory, conferirTexto, LIMITES, lerJpeg } from "./instagram-validate.ts";

const LEGENDA_BOA =
  "Estacionamento no aeroporto de Confins: a diária mais barata nem sempre fecha a semana mais barata.\n\n" +
  "A conta muda pelo traslado.\n\nO guia completo está no link da bio.\n\n#confins #estacionamentoaeroporto #movepark";
const SLIDES_BONS = [
  { alt: "pátio coberto de estacionamento em Confins ao entardecer", texto: "O mais barato na diária" },
  { alt: "van de traslado parada na saída do estacionamento", texto: "O traslado decide a conta" },
];
const KEY = "estacionamento no aeroporto de Confins";

const conferir = (over: Partial<Parameters<typeof conferirTexto>[0]> = {}) =>
  conferirTexto({ caption: LEGENDA_BOA, slides: SLIDES_BONS, keyphrase: KEY, ...over });

Deno.test("post bem escrito passa sem bloqueio e sem aviso", () => {
  assertEquals(conferir(), { blockers: [], warnings: [] });
});

Deno.test("legenda vazia bloqueia", () => {
  assertEquals(conferir({ caption: "   " }).blockers.includes("A legenda está vazia."), true);
});

Deno.test("legenda acima de 2.200 caracteres bloqueia", () => {
  const r = conferir({ caption: "a".repeat(LIMITES.legenda + 1) });
  assertEquals(r.blockers.some((b) => b.includes("2200")), true);
});

Deno.test("31 hashtags bloqueia e 2 hashtags só avisa", () => {
  const muitas = "Texto. " + Array.from({ length: 31 }, (_, i) => `#tag${i}`).join(" ");
  assertEquals(conferir({ caption: muitas }).blockers.some((b) => b.includes("31 hashtags")), true);
  const poucas = conferir({ caption: "Estacionamento no aeroporto de Confins sai mais barato. #confins #movepark" });
  assertEquals(poucas.blockers, []);
  assertEquals(poucas.warnings.some((w) => w.includes("2 hashtags")), true);
});

Deno.test("mais de 10 slides bloqueia", () => {
  const slides = Array.from({ length: 11 }, (_, i) => ({ alt: `pátio ${i}`, texto: null }));
  assertEquals(conferir({ slides }).blockers.some((b) => b.includes("11 slides")), true);
});

Deno.test("travessão na legenda e no alt bloqueia", () => {
  assertEquals(conferir({ caption: LEGENDA_BOA.replace(":", " \u2014") }).blockers.some((b) => b.startsWith("Travessão na legenda")), true);
  const slides = [{ alt: "pátio \u2013 vista aérea", texto: null }];
  assertEquals(conferir({ slides }).blockers.some((b) => b.startsWith("Travessão no texto alternativo do slide 1")), true);
});

Deno.test("promessa de transação bloqueia (ADR-009)", () => {
  for (const frase of ["Vaga garantida com antecedência", "você pode cancelar gratuitamente", "preço fixo o ano todo"]) {
    const r = conferir({ caption: `${LEGENDA_BOA}\n${frase}` });
    assertEquals(r.blockers.some((b) => b.includes("ADR-009")), true, frase);
  }
});

Deno.test("marca grafada errada bloqueia, minúscula em hashtag e domínio passa", () => {
  assertEquals(conferir({ caption: `${LEGENDA_BOA}\nReserve pela MovePark.` }).blockers.some((b) => b.includes("Movepark")), true);
  assertEquals(conferir({ caption: `${LEGENDA_BOA}\nMOVEPARK` }).blockers.some((b) => b.includes("Movepark")), true);
  assertEquals(conferir({ caption: `${LEGENDA_BOA}\nmovepark.co` }).blockers, []);
});

Deno.test("R$ sem data de referência bloqueia, com data passa", () => {
  const comPreco = `${LEGENDA_BOA}\nDiárias a partir de R$ 45.`;
  assertEquals(conferir({ caption: comPreco }).blockers.some((b) => b.includes("price_date")), true);
  assertEquals(conferir({ caption: comPreco, priceDate: "2026-10-20", hoje: new Date("2026-10-21T12:00:00-03:00") }).blockers, []);
  const slides = [{ alt: "tabela de preço", texto: "R$ 510 por 30 diárias" }];
  assertEquals(conferir({ slides }).blockers.some((b) => b.includes("price_date")), true);
});

Deno.test("preço conferido há mais de 30 dias avisa", () => {
  const r = conferir({ caption: `${LEGENDA_BOA}\nR$ 45`, priceDate: "2026-09-01", hoje: new Date("2026-10-21T12:00:00-03:00") });
  assertEquals(r.warnings.some((w) => w.includes("50 dias")), true);
});

Deno.test("data de preço malformada conta como ausente: bloqueia junto com R$", () => {
  for (const data of ["20/10/2026", "x", "2026-02-30"]) {
    const r = conferir({ caption: `${LEGENDA_BOA}\nR$ 45`, priceDate: data, hoje: new Date("2026-10-21T12:00:00-03:00") });
    assertEquals(r.blockers.some((b) => b.includes("price_date")), true, data);
  }
});

Deno.test("data de preço no futuro avisa, sem bloquear", () => {
  const r = conferir({ caption: `${LEGENDA_BOA}\nR$ 45`, priceDate: "2026-10-25", hoje: new Date("2026-10-21T12:00:00-03:00") });
  assertEquals(r.blockers, []);
  assertEquals(r.warnings.some((w) => w.includes("futuro")), true);
});

Deno.test("data de preço de hoje, conferida de manhã, não vira futuro", () => {
  const r = conferir({ caption: `${LEGENDA_BOA}\nR$ 45`, priceDate: "2026-10-21", hoje: new Date("2026-10-21T09:00:00-03:00") });
  assertEquals(r.warnings.some((w) => w.includes("futuro")), false);
});

Deno.test("uma hashtag usa o singular", () => {
  const r = conferir({ caption: "Estacionamento no aeroporto de Confins sai mais barato. #confins" });
  assertEquals(r.warnings, ["A legenda tem 1 hashtag. O ideal é de 3 a 5."]);
});

Deno.test("a frase de promessa manda tirar o texto, não a unidade", () => {
  const r = conferir({ caption: `${LEGENDA_BOA}\nVaga garantida com antecedência` });
  assertEquals(r.blockers.some((b) => b.includes("Tire essa frase do texto (ADR-009).")), true);
});

Deno.test("frase-chave fora dos primeiros 125 caracteres avisa", () => {
  const r = conferir({ caption: `${"Texto de abertura sem a frase. ".repeat(5)}\n${LEGENDA_BOA}` });
  assertEquals(r.warnings.some((w) => w.includes("125")), true);
});

Deno.test("slide sem alt e alt repetido avisam", () => {
  const r = conferir({ slides: [{ alt: "pátio", texto: null }, { alt: "Pátio", texto: null }, { alt: "", texto: null }] });
  assertEquals(r.warnings.some((w) => w.includes("slide 3 está sem texto alternativo")), true);
  assertEquals(r.warnings.some((w) => w.includes("repetido")), true);
});

/** JPEG mínimo: SOI, APP0 de 16 bytes e um SOF0 com altura e largura. */
function jpegFalso(largura: number, altura: number, extra = 0): Uint8Array {
  const app0 = [0xff, 0xe0, 0x00, 0x10, ...new Array(14).fill(0)];
  const sof0 = [0xff, 0xc0, 0x00, 0x11, 0x08, altura >> 8, altura & 255, largura >> 8, largura & 255, 0x03, ...new Array(9).fill(0)];
  return new Uint8Array([0xff, 0xd8, ...app0, ...sof0, ...new Array(extra).fill(0)]);
}

Deno.test("lerJpeg lê a largura e a altura do SOF", () => {
  const info = lerJpeg(jpegFalso(1080, 1350));
  assertEquals([info.jpeg, info.largura, info.altura], [true, 1080, 1350]);
});

Deno.test("PNG não é JPEG", () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  assertEquals(conferirImagem(lerJpeg(png), "slide.png")[0].includes("não é JPEG"), true);
});

Deno.test("1080x1350 passa; largura acima de 1440, 9:16 e acima de 8 MB bloqueiam", () => {
  assertEquals(conferirImagem(lerJpeg(jpegFalso(1080, 1350)), "a.jpg"), []);
  assertEquals(conferirImagem(lerJpeg(jpegFalso(1600, 2000)), "b.jpg").some((e) => e.includes("1600 px")), true);
  assertEquals(conferirImagem(lerJpeg(jpegFalso(1080, 1920)), "c.jpg").some((e) => e.includes("proporção")), true);
  const grande = { jpeg: true, largura: 1080, altura: 1350, bytes: LIMITES.bytes + 1 };
  assertEquals(conferirImagem(grande, "d.jpg").some((e) => e.includes("8 MB")), true);
});

Deno.test("story: 1080x1920 (9:16) passa; 4:5, não JPEG e acima de 8 MB bloqueiam", () => {
  assertEquals(conferirStory(lerJpeg(jpegFalso(1080, 1920)), "s.jpg"), []);
  assertEquals(conferirStory(lerJpeg(jpegFalso(1080, 1350)), "f.jpg"), [
    "f.jpg está em 1080x1350. O story precisa ser vertical 9:16, como 1080x1920.",
  ]);
  assertEquals(conferirStory({ jpeg: false, largura: 0, altura: 0, bytes: 10 }, "s.png")[0].includes("não é JPEG"), true);
  const grande = { jpeg: true, largura: 1080, altura: 1920, bytes: LIMITES.bytes + 1 };
  assertEquals(conferirStory(grande, "g.jpg").some((e) => e.includes("8 MB")), true);
  assertEquals(conferirStory(lerJpeg(jpegFalso(2160, 3840)), "h.jpg").some((e) => e.includes("2160 px")), true);
});
