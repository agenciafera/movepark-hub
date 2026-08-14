// deno test --allow-none supabase/functions/submit-contact-message/validate.test.ts

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  MENSAGEM_MAXIMA,
  MENSAGEM_MINIMA,
  NOME_MAXIMO,
  validateContact,
} from "./validate.ts";

const valido = {
  name: "Ana Souza",
  email: "ana@exemplo.com",
  message: "Preciso mudar a data da minha reserva em Guarulhos.",
};

Deno.test("aceita uma mensagem completa e devolve os campos limpos", () => {
  const r = validateContact(valido);
  assertEquals(r.ok, true);
  if (r.ok) {
    assertEquals(r.clean.name, "Ana Souza");
    assertEquals(r.clean.email, "ana@exemplo.com");
  }
});

Deno.test("apara espaço nas pontas e normaliza o e-mail para minúsculo", () => {
  const r = validateContact({ ...valido, name: "  Ana Souza  ", email: "  Ana@Exemplo.COM " });
  assertEquals(r.ok, true);
  if (r.ok) {
    assertEquals(r.clean.name, "Ana Souza");
    assertEquals(r.clean.email, "ana@exemplo.com");
  }
});

/**
 * O honeypot responde 201, e não erro. Dizer "recusado" ensina o robô a
 * contornar; sucesso silencioso deixa ele achar que funcionou.
 */
Deno.test("honeypot preenchido finge sucesso e descarta", () => {
  const r = validateContact({ ...valido, hp_field: "http://spam.example" });
  assertEquals(r.ok, false);
  if (!r.ok) assertEquals(r.status, 201);
});

Deno.test("honeypot vazio ou só espaço não bloqueia gente de verdade", () => {
  assertEquals(validateContact({ ...valido, hp_field: "" }).ok, true);
  assertEquals(validateContact({ ...valido, hp_field: "   " }).ok, true);
  assertEquals(validateContact({ ...valido, hp_field: null }).ok, true);
});

Deno.test("campo obrigatório em branco é recusado", () => {
  for (const faltando of ["name", "email", "message"]) {
    const entrada = { ...valido, [faltando]: "   " };
    const r = validateContact(entrada);
    assertEquals(r.ok, false, `deveria recusar sem ${faltando}`);
    if (!r.ok) assertEquals(r.status, 400);
  }
});

Deno.test("e-mail sem formato de e-mail é recusado", () => {
  for (const ruim of ["ana", "ana@", "@exemplo.com", "ana exemplo.com", "ana@exemplo"]) {
    const r = validateContact({ ...valido, email: ruim });
    assertEquals(r.ok, false, `deveria recusar ${ruim}`);
  }
});

/** Abaixo do mínimo não é mensagem, é teclado esbarrado ou teste de robô. */
Deno.test("mensagem curta demais é recusada", () => {
  const r = validateContact({ ...valido, message: "a".repeat(MENSAGEM_MINIMA - 1) });
  assertEquals(r.ok, false);
  if (!r.ok) assertEquals(r.status, 400);

  assertEquals(validateContact({ ...valido, message: "a".repeat(MENSAGEM_MINIMA) }).ok, true);
});

Deno.test("mensagem longa demais é recusada", () => {
  assertEquals(validateContact({ ...valido, message: "a".repeat(MENSAGEM_MAXIMA) }).ok, true);
  assertEquals(validateContact({ ...valido, message: "a".repeat(MENSAGEM_MAXIMA + 1) }).ok, false);
});

Deno.test("nome longo demais é recusado", () => {
  assertEquals(validateContact({ ...valido, name: "a".repeat(NOME_MAXIMO) }).ok, true);
  assertEquals(validateContact({ ...valido, name: "a".repeat(NOME_MAXIMO + 1) }).ok, false);
});

/** A mensagem de erro vai para a tela, então precisa dizer o que fazer. */
Deno.test("erro de validação vem com texto para mostrar ao visitante", () => {
  const r = validateContact({ ...valido, email: "ana" });
  assertEquals(r.ok, false);
  if (!r.ok && r.status === 400) {
    assertEquals(typeof r.error, "string");
    assertEquals(r.error.length > 0, true);
  }
});
