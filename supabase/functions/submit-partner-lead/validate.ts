// Validação pura do lead (sem Deno/rede) — testável via deno test.

export interface LeadInput {
  company_name?: string;
  contact_name?: string;
  contact_email?: string;
  contact_phone?: string;
  tax_id?: string | null;
  contact_role?: string | null;
  city?: string | null;
  state?: string | null;
  estimated_spots?: number | null;
  message?: string | null;
  accept_terms?: boolean;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  referrer?: string | null;
  hp_field?: string | null;
}

export type CleanLead = {
  companyName: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  taxId: string;
};

export type ValidationResult =
  | { ok: true; clean: CleanLead }
  // honeypot preenchido → finge sucesso (201) e descarta silenciosamente
  | { ok: false; status: 201 }
  | { ok: false; status: 400; error: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateLead(input: LeadInput): ValidationResult {
  if (input.hp_field && String(input.hp_field).trim() !== "") {
    return { ok: false, status: 201 };
  }

  const companyName = (input.company_name ?? "").trim();
  const contactName = (input.contact_name ?? "").trim();
  const contactEmail = (input.contact_email ?? "").trim().toLowerCase();
  const contactPhone = (input.contact_phone ?? "").trim();
  const taxId = (input.tax_id ?? "").trim();

  if (!companyName || !contactName || !contactEmail || !contactPhone) {
    return { ok: false, status: 400, error: "Preencha empresa, nome, e-mail e telefone." };
  }
  if (!EMAIL_RE.test(contactEmail)) {
    return { ok: false, status: 400, error: "E-mail inválido." };
  }
  if (input.accept_terms !== true) {
    return { ok: false, status: 400, error: "É necessário aceitar os termos." };
  }

  return { ok: true, clean: { companyName, contactName, contactEmail, contactPhone, taxId } };
}
