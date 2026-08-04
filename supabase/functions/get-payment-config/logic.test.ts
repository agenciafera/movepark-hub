import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { montarConfigPublica, pareceChaveSecreta } from "./logic.ts";

/**
 * A rota é aberta e o corpo que ela devolve é público. A asserção que importa aqui
 * é a de que nenhuma chave secreta sai, em nenhum branch.
 */

Deno.test("a public key publishable passa inteira", () => {
  const c = montarConfigPublica("pk_PLJ29q6u2ocMEQvp", null);
  assertEquals(c.public_key, "pk_PLJ29q6u2ocMEQvp");
});

Deno.test("chave secreta NÃO sai, mesmo configurada por engano", () => {
  for (const k of ["sk_test_abc123", "sk_live_abc123", "sk_abc123"]) {
    assertEquals(montarConfigPublica(k, null).public_key, "", `${k} não pode vazar`);
  }
});

Deno.test("espaço e caixa não driblam a checagem", () => {
  // Copiar do painel costuma trazer espaço junto, e ninguém garante a caixa.
  for (const k of ["  sk_live_abc  ", "SK_LIVE_ABC", "Sk_Test_Abc"]) {
    assertEquals(montarConfigPublica(k, null).public_key, "", `${k} não pode vazar`);
  }
});

Deno.test("variável ausente vira string vazia, não a palavra undefined", () => {
  assertEquals(montarConfigPublica(undefined, null).public_key, "");
});

Deno.test("a política vem sempre completa, mesmo sem app_setting", () => {
  const c = montarConfigPublica("pk_x", null);
  assertEquals(typeof c.installment_policy.maxInstallments, "number");
  assertEquals(typeof c.installment_policy.enabled, "boolean");
});

Deno.test("campo estranho no app_setting não chega ao corpo público", () => {
  // O parse remonta a política campo a campo, então isto já é verdade. O teste
  // existe para o dia em que alguém trocar o remonta por um spread.
  const c = montarConfigPublica(
    "pk_x",
    JSON.stringify({ maxInstallments: 6, secret_key: "sk_live_vazou" }),
  );
  assertEquals("secret_key" in c.installment_policy, false);
  assertEquals(JSON.stringify(c).includes("sk_live_vazou"), false);
  assertEquals(c.installment_policy.maxInstallments, 6);
});

Deno.test("pareceChaveSecreta não confunde a publishable", () => {
  assertEquals(pareceChaveSecreta("pk_live_abc"), false);
  assertEquals(pareceChaveSecreta("sk_live_abc"), true);
});
