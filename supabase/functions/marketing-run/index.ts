// Edge Function: /marketing-run
//
// Executa uma campanha de marketing: matricula o público do segmento e caminha pelos nós do
// canvas, entregando e-mail (SES SMTP) e WhatsApp (template da Meta).
//
// POST /functions/v1/marketing-run   { "campaignId": uuid, "limit"?: number }
// → { enrolled, processed, sent, skipped, suppressed, failed, dispatchEnabled }
//
// Quem pode chamar: hub_admin (JWT do painel). É uma ferramenta de disparo em massa, então o gate
// é explícito e não depende só de `verify_jwt`.
//
// Quatro travas, nesta ordem, e todas do lado do servidor:
//   1. `marketing_dispatch_enabled` (app_setting) nasce `false`. Com ela desligada o motor roda
//      inteiro e grava cada mensagem como `skipped`, com o corpo já montado. Dá para conferir o
//      que sairia antes de deixar sair.
//   2. `marketing_test_recipient`: se preenchido, TODO e-mail vai para esse endereço em vez do
//      cliente. É o modo de ensaio com o disparo ligado.
//   3. `marketing_daily_send_cap`: teto diário somando todas as campanhas.
//   4. `marketing_campaign.send_cap`: teto de público por campanha, aplicado na matrícula.
//
// Consentimento e supressão são checados por contato em `decideSend`, antes de qualquer entrega.
// Todo e-mail sai com link de descadastro, que é obrigação legal e não item de backlog.

// @ts-expect-error - Deno remote import
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendEmail, siteUrl } from "../_shared/email.ts";
import { sendWhatsAppTemplate } from "../_shared/whatsapp.ts";
import {
  type Canvas,
  decideSend,
  evaluateCondition,
  findNode,
  nextNodeId,
  renderMergeTags,
  startNodeId,
  waitUntil,
} from "./engine.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Casca do e-mail de marketing. Simples de propósito: o que precisa existir é o descadastro. */
function wrapEmail(bodyHtml: string, unsubscribeUrl: string): string {
  return `<!doctype html>
<html lang="pt-BR"><body style="margin:0;background:#EDEDEF;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#EDEDEF;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFFFF;border-radius:12px;overflow:hidden;">
        <tr><td style="background:#4041A3;padding:20px 24px;color:#FFFFFF;font-size:18px;font-weight:600;">Movepark</td></tr>
        <tr><td style="padding:24px;color:#424242;font-size:15px;line-height:1.6;">${bodyHtml}</td></tr>
        <tr><td style="padding:16px 24px;background:#F7F7F8;color:#6A6A6A;font-size:12px;line-height:1.5;">
          Você recebeu este e-mail porque tem cadastro na Movepark.
          <a href="${unsubscribeUrl}" style="color:#5D5FEF;">Descadastrar</a>.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

// @ts-expect-error - Deno global
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const admin = createClient(
    // @ts-expect-error - Deno env
    Deno.env.get("SUPABASE_URL")!,
    // @ts-expect-error - Deno env
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  // ── Gate: só hub_admin ─────────────────────────────────────────────────────
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return json({ error: "unauthorized" }, 401);

  const { data: userData, error: userErr } = await admin.auth.getUser(token);
  if (userErr || !userData?.user) return json({ error: "unauthorized" }, 401);

  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", userData.user.id)
    .maybeSingle();

  if (profile?.role !== "hub_admin") return json({ error: "forbidden" }, 403);

  // ── Entrada ────────────────────────────────────────────────────────────────
  let campaignId = "";
  let limit = 100;
  try {
    const body = await req.json();
    campaignId = String(body?.campaignId ?? "");
    if (typeof body?.limit === "number") limit = Math.min(Math.max(body.limit, 1), 500);
  } catch {
    return json({ error: "payload inválido" }, 400);
  }
  if (!campaignId) return json({ error: "campaignId obrigatório" }, 400);

  const { data: campaign, error: campErr } = await admin
    .from("marketing_campaign")
    .select("id, name, status, canvas, send_cap")
    .eq("id", campaignId)
    .is("deleted_at", null)
    .maybeSingle();

  if (campErr || !campaign) return json({ error: "campanha não encontrada" }, 404);
  if (campaign.status === "paused" || campaign.status === "archived") {
    return json({ error: `campanha ${campaign.status}: nada a executar` }, 409);
  }

  const canvas = (campaign.canvas ?? { nodes: [], edges: [] }) as Canvas;
  if (!Array.isArray(canvas.nodes) || canvas.nodes.length === 0) {
    return json({ error: "canvas vazio: monte o fluxo antes de executar" }, 400);
  }

  // ── Config de disparo ──────────────────────────────────────────────────────
  const { data: settings } = await admin
    .from("app_setting")
    .select("key, value")
    .in("key", [
      "marketing_dispatch_enabled",
      "marketing_daily_send_cap",
      "marketing_test_recipient",
      "marketing_email_from",
      "partner_email_from",
    ]);

  const cfg: Record<string, string> = Object.fromEntries(
    (settings ?? []).map((r: { key: string; value: string }) => [r.key, r.value ?? ""]),
  );

  const dispatchEnabled = String(cfg.marketing_dispatch_enabled).toLowerCase() === "true";
  const testRecipient = (cfg.marketing_test_recipient ?? "").trim();
  const from = (cfg.marketing_email_from || cfg.partner_email_from || "").trim();
  const dailyCap = Number(cfg.marketing_daily_send_cap ?? "200") || 200;

  // Quanto já saiu hoje, somando todas as campanhas. O teto é da plataforma, não da campanha.
  const inicioDoDia = new Date();
  inicioDoDia.setHours(0, 0, 0, 0);
  const { count: sentToday } = await admin
    .from("marketing_message")
    .select("id", { count: "exact", head: true })
    .eq("status", "sent")
    .gte("sent_at", inicioDoDia.toISOString());

  let capRemaining = Math.max(0, dailyCap - (sentToday ?? 0));

  // ── Matrícula ──────────────────────────────────────────────────────────────
  const { data: enrollResult, error: enrollErr } = await admin.rpc(
    "marketing_enroll_campaign",
    { p_campaign_id: campaignId },
  );
  if (enrollErr) return json({ error: enrollErr.message }, 400);

  const { data: due, error: dueErr } = await admin.rpc("marketing_due_enrollments", {
    p_campaign_id: campaignId,
    p_limit: limit,
  });
  if (dueErr) return json({ error: dueErr.message }, 400);

  await admin
    .from("marketing_campaign")
    .update({
      status: "running",
      started_at: campaign.status === "draft" ? new Date().toISOString() : undefined,
    })
    .eq("id", campaignId);

  // ── Caminhada pelos nós ────────────────────────────────────────────────────
  const stats = { processed: 0, sent: 0, skipped: 0, suppressed: 0, failed: 0, completed: 0 };

  for (const row of (due ?? []) as Array<Record<string, unknown>>) {
    const enrollmentId = String(row.enrollment_id);
    const contactId = String(row.contact_id);
    const doc = (row.doc ?? {}) as Record<string, unknown>;

    // Onde parou. Sem nó corrente, começa no gatilho e já avança para o primeiro passo real.
    let nodeId = (row.current_node_id as string | null) ?? null;
    if (!nodeId) {
      const inicio = startNodeId(canvas);
      nodeId = inicio ? nextNodeId(canvas, inicio) : null;
    } else {
      nodeId = nextNodeId(canvas, nodeId);
    }

    stats.processed += 1;

    // Um passo por execução para os nós de entrega; condição e saída resolvem na hora. O limite
    // de voltas evita que um canvas com ciclo prenda a função até o timeout.
    let voltas = 0;
    let terminou = false;

    while (nodeId && voltas < 20) {
      voltas += 1;
      const node = findNode(canvas, nodeId);
      if (!node) break;

      if (node.type === "exit") {
        terminou = true;
        break;
      }

      if (node.type === "condition") {
        const passou = evaluateCondition(doc, node.data);
        nodeId = nextNodeId(canvas, node.id, passou ? "yes" : "no");
        continue;
      }

      if (node.type === "wait") {
        await admin
          .from("marketing_enrollment")
          .update({
            status: "waiting",
            current_node_id: node.id,
            wait_until: waitUntil(node.data, new Date()).toISOString(),
          })
          .eq("id", enrollmentId);
        nodeId = null;
        break;
      }

      if (node.type === "email" || node.type === "whatsapp") {
        const canal = node.type;
        const endereco = canal === "email" ? (row.email as string) : (row.phone as string);
        const consent =
          canal === "email" ? Boolean(row.email_consent) : Boolean(row.whatsapp_consent);
        const suprimido =
          canal === "email" ? Boolean(row.email_suppressed) : Boolean(row.whatsapp_suppressed);

        const decisao = decideSend({
          channel: canal,
          address: endereco,
          consent,
          suppressed: suprimido,
          dispatchEnabled,
          capRemaining,
        });

        const assunto =
          canal === "email"
            ? renderMergeTags(String(node.data?.subject ?? "Movepark"), doc)
            : null;
        const corpo =
          canal === "email"
            ? renderMergeTags(String(node.data?.body ?? ""), doc, { escape: true })
            : renderMergeTags(String(node.data?.preview ?? ""), doc);
        const template = canal === "whatsapp" ? String(node.data?.template ?? "") : null;

        // O destino real do ensaio. Guardado na própria linha para a tela não mentir sobre
        // para onde a mensagem foi.
        const destinoReal =
          canal === "email" && testRecipient ? testRecipient : String(endereco ?? "");

        const { data: msg } = await admin
          .from("marketing_message")
          .insert({
            campaign_id: campaignId,
            enrollment_id: enrollmentId,
            contact_id: contactId,
            node_id: node.id,
            channel: canal,
            status: decisao.status,
            to_address: destinoReal,
            subject: assunto,
            body: corpo,
            template_name: template,
            error: decisao.reason ?? null,
          })
          .select("id")
          .single();

        if (decisao.status === "queued") {
          let ok = false;
          let erro: string | undefined;

          if (canal === "email") {
            const { data: contato } = await admin
              .from("marketing_contact")
              .select("unsubscribe_token")
              .eq("id", contactId)
              .maybeSingle();
            const unsubscribeUrl = `${siteUrl()}/descadastro?t=${contato?.unsubscribe_token ?? ""}`;
            const res = await sendEmail({
              from,
              to: destinoReal,
              subject: assunto ?? "Movepark",
              html: wrapEmail(corpo, unsubscribeUrl),
            });
            ok = res.ok;
            erro = res.error;
          } else {
            const res = await sendWhatsAppTemplate({
              to: destinoReal,
              template: template ?? "",
              bodyParams: Array.isArray(node.data?.params)
                ? (node.data?.params as string[]).map((p) => renderMergeTags(String(p), doc))
                : [],
            });
            ok = res.ok;
            erro = res.error;
          }

          await admin
            .from("marketing_message")
            .update({
              status: ok ? "sent" : "failed",
              sent_at: ok ? new Date().toISOString() : null,
              error: ok ? null : (erro ?? "falha no envio"),
            })
            .eq("id", msg?.id);

          if (ok) {
            stats.sent += 1;
            capRemaining -= 1;
          } else {
            stats.failed += 1;
          }
        } else if (decisao.status === "suppressed") {
          stats.suppressed += 1;
        } else {
          stats.skipped += 1;
        }

        // Entrega é um passo por execução: marca onde parou e sai. Assim uma campanha com dois
        // e-mails seguidos não dispara os dois na mesma rodada.
        await admin
          .from("marketing_enrollment")
          .update({ status: "active", current_node_id: node.id, wait_until: null })
          .eq("id", enrollmentId);
        nodeId = null;
        break;
      }

      nodeId = nextNodeId(canvas, node.id);
    }

    if (terminou || (!nodeId && voltas >= 20)) {
      await admin
        .from("marketing_enrollment")
        .update({ status: "completed", completed_at: new Date().toISOString() })
        .eq("id", enrollmentId);
      stats.completed += 1;
    }
  }

  // Sem ninguém pendente, a campanha fecha. Evita que ela fique "running" para sempre no painel.
  const { count: pendentes } = await admin
    .from("marketing_enrollment")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", campaignId)
    .in("status", ["active", "waiting"]);

  await admin
    .from("marketing_campaign")
    .update({
      stats: { ...stats, updated_at: new Date().toISOString() },
      ...(pendentes === 0 ? { status: "done", finished_at: new Date().toISOString() } : {}),
    })
    .eq("id", campaignId);

  return json({
    ...stats,
    enrolled: (enrollResult as { enrolled?: number } | null)?.enrolled ?? 0,
    dispatchEnabled,
    testRecipient: testRecipient || null,
    capRemaining,
  });
});
