import { assertEquals } from "jsr:@std/assert";
import {
  markdownRestritoToHtml,
  markdownRestritoToLinhas,
  parseInlineRestrito,
  parseMarkdownRestrito,
  temAviso,
} from "./markdown-restrito.ts";

// Amostras compartilhadas com `src/lib/markdownRestrito.test.ts`: front e Edge leem o mesmo
// aviso do mesmo jeito.

Deno.test("parseMarkdownRestrito: vazio não produz bloco; linha = parágrafo; `-` agrupa em lista", () => {
  assertEquals(parseMarkdownRestrito(null), []);
  assertEquals(parseMarkdownRestrito("  \n\n  "), []);
  assertEquals(temAviso(" \n"), false);
  const blocos = parseMarkdownRestrito(
    "**Malas extras** são cobradas.\nA van leva até 2 malas.\n- Até 2 malas por pessoa\n- Acima disso, taxa por mala\n\nPagamento na chegada.",
  );
  assertEquals(blocos.map((b) => b.type), ["paragraph", "paragraph", "list", "paragraph"]);
  const lista = parseMarkdownRestrito("1. Chegue\n2. Pague\n- Pronto");
  assertEquals(lista.length, 2);
  assertEquals(lista[0].type === "list" && lista[0].ordered, true);
  assertEquals(lista[1].type === "list" && lista[1].ordered, false);
});

Deno.test("parseInlineRestrito: negrito, itálico, link https; esquema perigoso vira só o rótulo", () => {
  assertEquals(parseInlineRestrito("**forte** _leve_ *leve2* [regras](https://ex.com/r)"), [
    { type: "bold", children: [{ type: "text", value: "forte" }] },
    { type: "text", value: " " },
    { type: "italic", children: [{ type: "text", value: "leve" }] },
    { type: "text", value: " " },
    { type: "italic", children: [{ type: "text", value: "leve2" }] },
    { type: "text", value: " " },
    { type: "link", href: "https://ex.com/r", children: [{ type: "text", value: "regras" }] },
  ]);
  assertEquals(parseInlineRestrito("[clique](javascript:void0)"), [{ type: "text", value: "clique" }]);
  assertEquals(parseInlineRestrito("snake_case_aqui"), [{ type: "text", value: "snake_case_aqui" }]);
});

Deno.test("markdownRestritoToHtml: escapa HTML cru, aplica estilos inline e só liga http(s)", () => {
  const html = markdownRestritoToHtml(
    "<b>cru</b> & **forte**\n- item [site](https://ex.com/a?b=1&c=2)\n- [x](javascript:void0)",
    { paragrafo: "margin:0", lista: "padding-left:20px", item: "margin:0 0 4px", link: "color:#000", negrito: "color:#111" },
  );
  assertEquals(
    html,
    '<p style="margin:0">&lt;b&gt;cru&lt;/b&gt; &amp; <strong style="color:#111">forte</strong></p>' +
      '<ul style="padding-left:20px"><li style="margin:0 0 4px">item <a href="https://ex.com/a?b=1&amp;c=2" target="_blank" style="color:#000">site</a></li>' +
      '<li style="margin:0 0 4px">x</li></ul>',
  );
  assertEquals(markdownRestritoToHtml(null), "");
  assertEquals(markdownRestritoToHtml("**só**"), "<p><strong>só</strong></p>");
});

Deno.test("markdownRestritoToLinhas: texto puro para o PDF, com marcador e link em parênteses", () => {
  assertEquals(
    markdownRestritoToLinhas("**Malas extras** são cobradas.\n- Até 2 por pessoa\n- Veja as [regras](https://ex.com/r)\n1. Primeiro\n2. Segundo"),
    ["Malas extras são cobradas.", "• Até 2 por pessoa", "• Veja as regras (https://ex.com/r)", "1. Primeiro", "2. Segundo"],
  );
  assertEquals(markdownRestritoToLinhas(""), []);
});
