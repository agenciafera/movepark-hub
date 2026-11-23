import { assertEquals } from "jsr:@std/assert";
import { AVISO_QUESTION, avisoAutoAnswer } from "./aviso.ts";

Deno.test("avisoAutoAnswer: Markdown restrito vira resposta em texto puro, com marcador de lista", () => {
  assertEquals(
    avisoAutoAnswer("**Regras de bagagem na van da Pare Seguro.**\nO transfer inclui:\n- 1 mala grande\n- 1 bagagem de mão"),
    "Regras de bagagem na van da Pare Seguro.\nO transfer inclui:\n• 1 mala grande\n• 1 bagagem de mão",
  );
  assertEquals(AVISO_QUESTION.includes("—"), false);
});

Deno.test("avisoAutoAnswer: sem aviso não há pergunta", () => {
  assertEquals(avisoAutoAnswer(null), null);
  assertEquals(avisoAutoAnswer(""), null);
  assertEquals(avisoAutoAnswer("  \n "), null);
});
