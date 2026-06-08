import { assertEquals } from "jsr:@std/assert";
import { validateLead } from "./validate.ts";

const base = {
  company_name: "Estacionamento Teste",
  contact_name: "Operador",
  contact_email: "op@empresa.com",
  contact_phone: "+5511999990000",
  accept_terms: true,
};

Deno.test("honeypot preenchido → drop silencioso (201)", () => {
  assertEquals(validateLead({ ...base, hp_field: "sou-um-bot" }), { ok: false, status: 201 });
});

Deno.test("campo obrigatório ausente → 400", () => {
  const r = validateLead({ ...base, contact_email: "" });
  assertEquals(r.ok, false);
  if (!r.ok) assertEquals(r.status, 400);
});

Deno.test("e-mail inválido → 400", () => {
  const r = validateLead({ ...base, contact_email: "sem-arroba" });
  assertEquals(r.ok, false);
  if (!r.ok && r.status === 400) assertEquals(r.error, "E-mail inválido.");
});

Deno.test("sem aceitar termos → 400", () => {
  const r = validateLead({ ...base, accept_terms: false });
  assertEquals(r.ok, false);
  if (!r.ok && r.status === 400) assertEquals(r.error, "É necessário aceitar os termos.");
});

Deno.test("válido → normaliza (trim + e-mail lowercase)", () => {
  const r = validateLead({ ...base, contact_email: "  OP@Empresa.COM ", company_name: "  Estac  " });
  assertEquals(r.ok, true);
  if (r.ok) {
    assertEquals(r.clean.contactEmail, "op@empresa.com");
    assertEquals(r.clean.companyName, "Estac");
  }
});
