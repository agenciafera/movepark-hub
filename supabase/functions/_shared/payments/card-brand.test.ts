import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { normalizeBrand } from "./card-brand.ts";

Deno.test("normalizeBrand: o que a Pagar.me manda e o que o front grava viram a mesma coisa", () => {
  assertEquals(normalizeBrand("Visa"), "visa");
  assertEquals(normalizeBrand("visa"), "visa");
  assertEquals(normalizeBrand("Mastercard"), "mastercard");
  assertEquals(normalizeBrand("American Express"), "amex");
  assertEquals(normalizeBrand("Elo"), "elo");
  assertEquals(normalizeBrand("HiperCard"), "hipercard");
  assertEquals(normalizeBrand(null), "card");
  assertEquals(normalizeBrand("Diners"), "card");
});
