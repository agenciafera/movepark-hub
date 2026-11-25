// Leitura do pedido da Edge marketing-run, separada para ter teste sem subir Supabase.
// O motor em si mora em _shared/marketing/run.ts.

export type Pedido = { ok: true; campaignId: string; limit: number } | { ok: false; erro: string };

export function lerPedido(body: unknown): Pedido {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const campaignId = String(b.campaignId ?? "").trim();
  if (!campaignId) return { ok: false, erro: "campaignId obrigatório" };
  const limit = typeof b.limit === "number" ? b.limit : 100;
  return { ok: true, campaignId, limit };
}
