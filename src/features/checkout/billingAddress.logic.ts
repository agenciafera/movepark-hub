// Endereço de cobrança do cartão (17/09/2026). O antifraude da Pagar.me exige `billing_address`
// em todo pedido de cartão, e o endereço não entra no token: vai no pedido. Pedimos só CEP e
// número; rua, bairro, cidade e UF vêm do ViaCEP. Lógica pura, testável sem React.

/** O que o cliente digita e o que o ViaCEP devolve. É o que fica salvo no perfil para a próxima compra. */
export interface AddressParts {
  cep: string;
  number: string;
  complement?: string;
  street: string;
  neighborhood: string;
  city: string;
  state: string;
}

/** O que vai à Edge e ao gateway, no formato da Pagar.me. */
export interface BillingAddress {
  zip_code: string;
  line_1: string;
  line_2?: string;
  city: string;
  state: string;
  country: "BR";
}

/** Só dígitos; null se não tem 8. */
export function normalizeCep(v: string): string | null {
  const d = String(v ?? "").replace(/\D/g, "");
  return d.length === 8 ? d : null;
}

/** 00000-000 enquanto digita. */
export function formatCep(v: string): string {
  const d = String(v ?? "").replace(/\D/g, "").slice(0, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
}

export function viaCepUrl(cep: string): string {
  return `https://viacep.com.br/ws/${cep}/json/`;
}

/** O ViaCEP responde `{ erro: true }` para CEP inexistente; campos vazios viram string vazia. */
export function parseViaCep(json: unknown): Pick<AddressParts, "street" | "neighborhood" | "city" | "state"> | null {
  const j = (json && typeof json === "object" ? json : {}) as Record<string, unknown>;
  if (j.erro === true || j.erro === "true") return null;
  const s = (k: string) => (typeof j[k] === "string" ? (j[k] as string).trim() : "");
  const city = s("localidade");
  const state = s("uf");
  if (!city || !state) return null;
  return { street: s("logradouro"), neighborhood: s("bairro"), city, state };
}

/** Monta o endereço do gateway ou diz o que falta. line_1 no formato que a Pagar.me pede: número, rua, bairro. */
export function buildBillingAddress(p: AddressParts): { address: BillingAddress; error?: undefined } | { address?: undefined; error: string } {
  const cep = normalizeCep(p.cep);
  if (!cep) return { error: "Informe o CEP do endereço do cartão." };
  const number = String(p.number ?? "").trim();
  if (!number) return { error: "Informe o número do endereço do cartão." };
  if (!p.city || !p.state) return { error: "Não achamos esse CEP. Confira os dígitos." };
  const line1 = [number, p.street, p.neighborhood].map((x) => String(x ?? "").trim()).filter(Boolean).join(", ");
  const complement = String(p.complement ?? "").trim();
  return {
    address: {
      zip_code: cep,
      line_1: line1,
      ...(complement ? { line_2: complement } : {}),
      city: p.city.trim(),
      state: p.state.trim().toUpperCase().slice(0, 2),
      country: "BR",
    },
  };
}

/** Prefill do perfil: só aceita o que tem a cara de AddressParts. */
export function addressPartsFrom(v: unknown): AddressParts | null {
  const o = (v && typeof v === "object" ? v : null) as Record<string, unknown> | null;
  if (!o || typeof o.cep !== "string" || typeof o.number !== "string") return null;
  const s = (k: string) => (typeof o[k] === "string" ? (o[k] as string) : "");
  return { cep: o.cep, number: o.number, complement: s("complement") || undefined, street: s("street"), neighborhood: s("neighborhood"), city: s("city"), state: s("state") };
}
