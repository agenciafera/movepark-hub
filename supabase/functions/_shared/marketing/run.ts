// Núcleo do motor de campanha: matricula o público e anda um passo por pessoa.
//
// Usado pela Edge marketing-run (botão da tela) e pelo MCP (tool marketing_run_campaign). Um motor
// só para os dois, então as travas valem igual para tela e IA: prontidão do fluxo, supressão,
// consentimento, endereço, chave geral, teto do dia e destinatário de ensaio.
// Spec: docs/specs/marketing-mcp.md § 6 e marketing-automation.md § 7.

import { sendEmail as sendEmailReal, siteUrl as siteUrlReal } from "../email.ts";
import { sendWhatsAppTemplate as sendWhatsAppReal } from "../whatsapp.ts";
import { validateCanvas } from "./canvas.ts";
import {
  advancesAfterDelivery,
  type Canvas,
  decideSend,
  type DeliveryOutcome,
  nextStep,
  renderMergeTags,
  waitUntil,
} from "./engine.ts";

// deno-lint-ignore no-explicit-any
type Db = any;

export type Actor = { kind: "hub_admin" | "api_key"; id: string | null; label: string };

export type RunResult = {
  enrolled: number;
  processed: number;
  sent: number;
  skipped: number;
  suppressed: number;
  failed: number;
  completed: number;
  dispatchEnabled: boolean;
  testRecipient: string | null;
  capRemaining: number;
};

export class RunError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

type RunDeps = {
  sendEmail: typeof sendEmailReal;
  sendWhatsAppTemplate: typeof sendWhatsAppReal;
  siteUrl: typeof siteUrlReal;
};

export function actorJson(actor: Actor): Record<string, unknown> {
  return { kind: actor.kind, id: actor.id, label: actor.label };
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

export async function runCampaign(
  admin: Db,
  campaignId: string,
  opts: { limit?: number; actor: Actor; deps?: Partial<RunDeps> },
): Promise<RunResult> {
  const deps: RunDeps = {
    sendEmail: opts.deps?.sendEmail ?? sendEmailReal,
    sendWhatsAppTemplate: opts.deps?.sendWhatsAppTemplate ?? sendWhatsAppReal,
    siteUrl: opts.deps?.siteUrl ?? siteUrlReal,
  };
  const limit = Math.min(Math.max(Number(opts.limit ?? 100) || 100, 1), 500);

  const { data: campaign, error: campErr } = await admin
    .from("marketing_campaign")
    .select("id, name, status, canvas, send_cap")
    .eq("id", campaignId)
    .is("deleted_at", null)
    .maybeSingle();

  if (campErr || !campaign) throw new RunError(404, "Campanha não encontrada.");
  if (campaign.status === "paused" || campaign.status === "archived" || campaign.status === "done") {
    throw new RunError(409, `Campanha ${campaign.status}: nada a executar.`);
  }

  const canvas = (campaign.canvas ?? { nodes: [], edges: [] }) as Canvas;
  const problemas = validateCanvas(canvas);
  if (problemas.length > 0) {
    throw new RunError(
      400,
      `O fluxo tem problema e não roda: ${problemas.map((p) => p.message).join(" ")}`,
    );
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
  const { data: enrollResult, error: enrollErr } = await admin.rpc("marketing_enroll_campaign", {
    p_campaign_id: campaignId,
  });
  if (enrollErr) throw new RunError(400, enrollErr.message);

  const { data: due, error: dueErr } = await admin.rpc("marketing_due_enrollments", {
    p_campaign_id: campaignId,
    p_limit: limit,
  });
  if (dueErr) throw new RunError(400, dueErr.message);

  await admin
    .from("marketing_campaign")
    .update({
      status: "running",
      started_at: campaign.status === "draft" ? new Date().toISOString() : undefined,
    })
    .eq("id", campaignId);

  // ── Caminhada pelos nós ────────────────────────────────────────────────────
  //
  // Um passo por execução: cada contato anda até o próximo envio ou espera (`nextStep`), e só sai
  // do envio quando a mensagem teve destino final (`advancesAfterDelivery`). Segurada (ensaio ou
  // teto do dia) e falha deixam o contato onde estava, então a próxima execução manda a mesma
  // mensagem. Correção de 25/11/2026 (marketing-automation.md § 11).
  const stats = { processed: 0, sent: 0, skipped: 0, suppressed: 0, failed: 0, completed: 0 };

  const concluir = async (enrollmentId: string) => {
    await admin
      .from("marketing_enrollment")
      .update({ status: "completed", completed_at: new Date().toISOString() })
      .eq("id", enrollmentId);
    stats.completed += 1;
  };

  const esperar = async (enrollmentId: string, node: { id: string; data?: Record<string, unknown> }) => {
    await admin
      .from("marketing_enrollment")
      .update({
        status: "waiting",
        current_node_id: node.id,
        wait_until: waitUntil(node.data, new Date()).toISOString(),
      })
      .eq("id", enrollmentId);
  };

  for (const row of (due ?? []) as Array<Record<string, unknown>>) {
    const enrollmentId = String(row.enrollment_id);
    const contactId = String(row.contact_id);
    const doc = (row.doc ?? {}) as Record<string, unknown>;
    stats.processed += 1;

    const passo = nextStep(canvas, (row.current_node_id as string | null) ?? null, doc);
    if (passo.kind === "end") {
      await concluir(enrollmentId);
      continue;
    }
    if (passo.kind === "wait") {
      await esperar(enrollmentId, passo.node);
      continue;
    }

    // Envio.
    const node = passo.node;
    const canal = node.type as "email" | "whatsapp";
    const endereco = canal === "email" ? (row.email as string) : (row.phone as string);
    const decisao = decideSend({
      channel: canal,
      address: endereco,
      consent: canal === "email" ? Boolean(row.email_consent) : Boolean(row.whatsapp_consent),
      suppressed: canal === "email" ? Boolean(row.email_suppressed) : Boolean(row.whatsapp_suppressed),
      dispatchEnabled,
      capRemaining,
    });

    const assunto =
      canal === "email" ? renderMergeTags(String(node.data?.subject ?? "Movepark"), doc) : null;
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

    let resultado: DeliveryOutcome;
    if (decisao.status === "queued") {
      let ok = false;
      let erro: string | undefined;
      if (canal === "email") {
        const { data: contato } = await admin
          .from("marketing_contact")
          .select("unsubscribe_token")
          .eq("id", contactId)
          .maybeSingle();
        const unsubscribeUrl = `${deps.siteUrl()}/descadastro?t=${contato?.unsubscribe_token ?? ""}`;
        const res = await deps.sendEmail({
          from,
          to: destinoReal,
          subject: assunto ?? "Movepark",
          html: wrapEmail(corpo, unsubscribeUrl),
        });
        ok = res.ok;
        erro = res.error;
      } else {
        const res = await deps.sendWhatsAppTemplate({
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
        resultado = "sent";
      } else {
        stats.failed += 1;
        resultado = "failed";
      }
    } else if (decisao.status === "suppressed") {
      stats.suppressed += 1;
      resultado = "suppressed";
    } else {
      stats.skipped += 1;
      resultado = "skipped";
    }

    // Falhas neste nó, contando a de agora: é o que decide se ainda vale tentar de novo.
    let falhas = 0;
    if (resultado === "failed") {
      const { count } = await admin
        .from("marketing_message")
        .select("id", { count: "exact", head: true })
        .eq("enrollment_id", enrollmentId)
        .eq("node_id", node.id)
        .eq("status", "failed");
      falhas = count ?? 1;
    }
    if (!advancesAfterDelivery(resultado, falhas)) continue;

    // Saiu do envio. Se o que vem depois é fim ou espera, já resolve agora: concluir na hora
    // evita que a campanha fique "em andamento" esperando um clique só para fechar, e a espera
    // começa a contar do envio, não da próxima execução.
    const depois = nextStep(canvas, node.id, doc);
    if (depois.kind === "end") {
      await concluir(enrollmentId);
    } else if (depois.kind === "wait") {
      await esperar(enrollmentId, depois.node);
    } else {
      await admin
        .from("marketing_enrollment")
        .update({ status: "active", current_node_id: node.id, wait_until: null })
        .eq("id", enrollmentId);
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

  const result: RunResult = {
    ...stats,
    enrolled: (enrollResult as { enrolled?: number } | null)?.enrolled ?? 0,
    dispatchEnabled,
    testRecipient: testRecipient || null,
    capRemaining,
  };

  // Auditoria da execução. Nunca derruba a resposta: o envio já aconteceu.
  const { error: auditErr } = await admin.rpc("marketing_audit_write", {
    p_actor: actorJson(opts.actor),
    p_action: "campaign.run",
    p_entity: "marketing_campaign",
    p_entity_id: campaignId,
    p_before: null,
    p_after: result,
    p_reason: null,
  });
  if (auditErr) console.warn("[marketing] auditoria da execução falhou:", auditErr.message);

  return result;
}
