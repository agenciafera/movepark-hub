// Rastro das chamadas aos provedores (`integration_attempt`), na linha do rastro do gateway
// (docs/specs/rastro-do-gateway.md): a equipe confere o que foi e o que voltou sem abrir o painel
// do provedor. O token nunca entra (vai no cabeçalho, não no corpo), e contato e documento do
// cliente ficam mascarados, porque o rastro dura mais que a reserva.

function maskEmail(v: string): string {
  const at = v.indexOf("@");
  if (at <= 0) return "***";
  return `${v[0]}***${v.slice(at)}`;
}

function maskTail(v: string, keep: number): string {
  const digits = v.replace(/\D/g, "");
  return `***${digits.slice(-keep)}`;
}

export function redactForTrail(body: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...body };
  if (typeof out.email === "string" && out.email) out.email = maskEmail(out.email);
  if (typeof out.phone === "string" && out.phone) out.phone = maskTail(out.phone, 4);
  if (typeof out.document === "string" && out.document) out.document = maskTail(out.document, 2);
  return out;
}
