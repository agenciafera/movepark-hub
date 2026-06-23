import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { isAssignableRole, normalizeEmail, ROLE_LABEL } from "./logic.ts";

Deno.test("isAssignableRole aceita só os 4 presets", () => {
  for (const r of ["owner", "manager", "operator", "finance"]) {
    assertEquals(isAssignableRole(r), true);
  }
  assertEquals(isAssignableRole("admin"), false);
  assertEquals(isAssignableRole("hub_admin"), false);
  assertEquals(isAssignableRole(""), false);
  assertEquals(isAssignableRole(undefined), false);
});

Deno.test("normalizeEmail: trim + lowercase; rejeita inválido", () => {
  assertEquals(normalizeEmail("  Ana@Empresa.COM "), "ana@empresa.com");
  assertEquals(normalizeEmail("semarroba"), null);
  assertEquals(normalizeEmail("a@b"), null);
  assertEquals(normalizeEmail(""), null);
  assertEquals(normalizeEmail(123), null);
});

Deno.test("ROLE_LABEL cobre os 4 papéis", () => {
  assertEquals(ROLE_LABEL.owner, "Dono");
  assertEquals(ROLE_LABEL.manager, "Gerente");
  assertEquals(ROLE_LABEL.operator, "Operação");
  assertEquals(ROLE_LABEL.finance, "Financeiro");
});
