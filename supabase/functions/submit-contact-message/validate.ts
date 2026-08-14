// Validação pura da mensagem de contato (sem Deno/rede) — testável via deno test.
// Mesmo formato do submit-partner-lead/validate.ts.

export interface ContactInput {
  name?: string;
  email?: string;
  message?: string;
  page_url?: string | null;
  hp_field?: string | null;
}

export type CleanContact = {
  name: string;
  email: string;
  message: string;
};

export type ValidationResult =
  | { ok: true; clean: CleanContact }
  // honeypot preenchido → finge sucesso (201) e descarta silenciosamente
  | { ok: false; status: 201 }
  | { ok: false; status: 400; error: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Abaixo disso não é mensagem, é teclado esbarrado ou teste de robô. */
export const MENSAGEM_MINIMA = 10;

/** Teto de guarda: o campo é `text` no banco, o limite existe contra abuso. */
export const MENSAGEM_MAXIMA = 5000;

/** Nome que passa disso é payload, não nome. */
export const NOME_MAXIMO = 120;

export function validateContact(input: ContactInput): ValidationResult {
  // O honeypot responde 201 em vez de erro: dizer "recusado" ensina o robô a
  // contornar. Sucesso silencioso deixa ele achar que funcionou.
  if (input.hp_field && String(input.hp_field).trim() !== "") {
    return { ok: false, status: 201 };
  }

  const name = (input.name ?? "").trim();
  const email = (input.email ?? "").trim().toLowerCase();
  const message = (input.message ?? "").trim();

  if (!name || !email || !message) {
    return { ok: false, status: 400, error: "Preencha nome, e-mail e mensagem." };
  }
  if (name.length > NOME_MAXIMO) {
    return { ok: false, status: 400, error: "Nome muito longo." };
  }
  if (!EMAIL_RE.test(email)) {
    return { ok: false, status: 400, error: "E-mail inválido." };
  }
  if (message.length < MENSAGEM_MINIMA) {
    return { ok: false, status: 400, error: "Escreva um pouco mais para a gente entender o pedido." };
  }
  if (message.length > MENSAGEM_MAXIMA) {
    return { ok: false, status: 400, error: "Mensagem muito longa. Resuma o pedido." };
  }

  return { ok: true, clean: { name, email, message } };
}
