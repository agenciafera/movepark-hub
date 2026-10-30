// Edge Function: /integration-deliver
// Processa a fila de integrações com terceiros (Cloudpark primeiro). Spec: docs/specs/integracoes.md § 5.5.
//
// 1. Reivindica as entregas vencidas (`integration_delivery_claim`, concessão de 5 minutos) e
//    manda cada uma ao provedor (`_shared/integrations/process.ts`): código → voucher refeito e
//    e-mail certo; falha passageira → nova tentativa (1, 2, 4, 8, 16 min, depois de hora em hora);
//    recusa ou token inválido → falha definitiva com alerta.
// 2. Solta as retenções vencidas (`integration_hold_release_claim`): o e-mail de confirmação que
//    esperava o código há 15 minutos sai com o QR do Hub, e a equipe e o parceiro são avisados.
//    Vem depois do passo 1 para a entrega que acabou de dar certo não soltar o e-mail sem código.
//
// Chamada pelo pg_cron (pg_net) a cada minuto, só quando há trabalho. Protegida pelo header
// x-integration-deliver-key, cuja chave mora no Vault e é lida por RPC restrita ao service_role.
// verify_jwt = false (server-to-server por header próprio).
//
// POST /functions/v1/integration-deliver   (header: x-integration-deliver-key: <chave>)
// → { ok, delivered, retried, failed, cancelled, released }

// @ts-expect-error - Deno remote import
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { afterHoldReleased, type ClaimedDelivery, processDelivery } from "../_shared/integrations/process.ts";
import { emptySummary, keyMatches } from "./logic.ts";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

// @ts-expect-error - Deno global
Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const admin = createClient(
    // @ts-expect-error - Deno env
    Deno.env.get("SUPABASE_URL")!,
    // @ts-expect-error - Deno env
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const { data: expected } = await admin.rpc("integration_deliver_expected_key");
  if (!keyMatches(req.headers.get("x-integration-deliver-key"), expected)) {
    return json({ error: "unauthorized" }, 401);
  }

  const summary = emptySummary();

  const { data: rows, error } = await admin.rpc("integration_delivery_claim", { p_limit: 20 });
  if (error) return json({ error: error.message }, 500);
  for (const d of (rows ?? []) as ClaimedDelivery[]) {
    summary[await processDelivery(admin, d)]++;
  }

  const { data: holds, error: holdErr } = await admin.rpc("integration_hold_release_claim", { p_limit: 50 });
  if (holdErr) return json({ error: holdErr.message }, 500);
  for (const h of (holds ?? []) as {
    id: string;
    booking_id: string | null;
    company_id: string;
    connection_id: string;
    email_held_at: string | null;
    last_error: string | null;
  }[]) {
    await afterHoldReleased(admin, h, { retrying: true, error: h.last_error });
    summary.released++;
  }

  return json({ ok: true, ...summary });
});
