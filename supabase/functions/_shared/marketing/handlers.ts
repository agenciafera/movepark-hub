// MCP de marketing: execução das tools. Recebe o cliente do banco (service_role) e quem está agindo.
//
// O banco é a regra (RPCs das migrations 20261207110000 e 20261207120000). Aqui só se traduz
// argumento em chamada e se junta o que a IA precisa numa resposta. Erro de negócio das RPCs vem em
// P0001 e chega à IA com a mensagem (safeToolError no MCP). Spec: docs/specs/marketing-mcp.md § 5.
//
// Reserva do white-label não entra em nenhuma leitura: o contrato diz que esse cliente é dado do
// parceiro (reservas-wl-no-hub.md § 3.4). Tudo aqui lê marketing_* e booking.

import { validateCanvas } from "./canvas.ts";
import { type Canvas, renderMergeTags } from "./engine.ts";
import { type Actor, actorJson, runCampaign } from "./run.ts";

// deno-lint-ignore no-explicit-any
type Db = any;

export type MarketingDeps = {
  alertarDisparoLigado: (info: { actorLabel: string; reason: string }) => Promise<void>;
  run?: typeof runCampaign;
};

export const MARKETING_HANDLED = [
  "marketing_list_locations", "marketing_get_rfm", "marketing_get_funnel", "marketing_get_discoveries",
  "marketing_get_profiles", "marketing_list_segment_fields", "marketing_preview_segment",
  "marketing_list_segments", "marketing_list_contacts", "marketing_get_contact",
  "marketing_list_campaigns", "marketing_get_campaign", "marketing_render_message",
  "marketing_list_leads", "marketing_list_coupons", "marketing_get_dispatch_config",
  "marketing_save_segment", "marketing_delete_segment", "marketing_save_campaign",
  "marketing_set_campaign_status", "marketing_move_lead", "marketing_save_coupon",
  "marketing_set_coupon_active", "marketing_set_dispatch_config", "marketing_run_campaign",
  "marketing_set_dispatch_enabled",
] as const;

async function rpc(db: Db, fn: string, args: Record<string, unknown> = {}): Promise<unknown> {
  const { data, error } = await db.rpc(fn, args);
  if (error) throw error;
  return data;
}

async function rows(q: PromiseLike<{ data: unknown; error: unknown }>): Promise<unknown> {
  const { data, error } = await q;
  if (error) throw error;
  return data;
}

const ids = (v: unknown): string[] | null =>
  Array.isArray(v) && v.length > 0 ? v.map(String) : null;
const num = (v: unknown): number | null =>
  v === undefined || v === null || v === "" ? null : Number(v);
const txt = (v: unknown): string | null =>
  v === undefined || v === null ? null : String(v);

function contactKeyFrom(a: Record<string, unknown>): string {
  if (a.contact_key) return String(a.contact_key);
  if (a.email) return String(a.email).trim().toLowerCase();
  if (a.phone) return String(a.phone).replace(/\D/g, "");
  throw new Error("Informe email, phone ou contact_key.");
}

async function audit(
  db: Db,
  actor: Actor,
  action: string,
  entity: string,
  entityId: string | null,
  before: unknown,
  after: unknown,
) {
  await rpc(db, "marketing_audit_write", {
    p_actor: actorJson(actor),
    p_action: action,
    p_entity: entity,
    p_entity_id: entityId,
    p_before: before ?? null,
    p_after: after ?? null,
    p_reason: null,
  });
}

export async function callMarketing(
  db: Db,
  actor: Actor,
  name: string,
  a: Record<string, unknown>,
  deps: MarketingDeps,
): Promise<unknown> {
  const run = deps.run ?? runCampaign;
  const ator = actorJson(actor);

  switch (name) {
    // ── Leitura ──────────────────────────────────────────────────────────────
    case "marketing_list_locations":
      return {
        unidades: await rows(
          db.from("location")
            .select("id, name, slug, checkout_mode, is_listed, destination_id, company:company_id(name, slug)")
            .is("deleted_at", null)
            .order("name"),
        ),
      };

    case "marketing_get_rfm":
      return await rpc(db, "marketing_rfm_overview", {
        p_location_ids: ids(a.location_ids),
        p_window_days: num(a.window_days),
      });

    case "marketing_get_funnel":
      return await rpc(db, "marketing_conversion_funnel", {
        p_from: String(a.from),
        p_to: String(a.to),
        p_location_ids: ids(a.location_ids),
      });

    case "marketing_get_discoveries":
      return await rpc(db, "marketing_discoveries", {
        p_location_ids: ids(a.location_ids),
        p_window_days: num(a.window_days) ?? 90,
      });

    case "marketing_get_profiles":
      return await rpc(db, "marketing_profile_matrix", { p_location_ids: ids(a.location_ids) });

    case "marketing_list_segment_fields":
      return { campos: await rpc(db, "marketing_segment_fields") };

    case "marketing_preview_segment": {
      const problems = ((await rpc(db, "marketing_validate_definition", {
        p_def: a.definition,
      })) as string[] | null) ?? [];
      if (problems.length > 0) return { problems, preview: null };
      const preview = await rpc(db, "marketing_segment_preview", {
        p_definition: a.definition,
        p_location_ids: ids(a.location_ids),
        p_limit: num(a.limit) ?? 25,
      });
      return { problems: [], preview };
    }

    case "marketing_list_segments": {
      const segmentos = ((await rows(
        db.from("marketing_segment")
          .select("id, name, slug, description, definition, location_ids, is_system, updated_at")
          .is("deleted_at", null)
          .order("name"),
      )) as Array<Record<string, unknown>> | null) ?? [];
      const contagens = ((await rpc(db, "marketing_segment_counts", {
        p_location_ids: ids(a.location_ids),
      })) as Array<Record<string, unknown>> | null) ?? [];
      const porId = new Map(contagens.map((c) => [c.segment_id, c]));
      return {
        segmentos: segmentos.map((s) => ({
          ...s,
          total: porId.get(s.id)?.total ?? 0,
          reachable_email: porId.get(s.id)?.reachable_email ?? 0,
          reachable_whatsapp: porId.get(s.id)?.reachable_whatsapp ?? 0,
        })),
      };
    }

    case "marketing_list_contacts": {
      const limite = num(a.limit) ?? 100;
      if (a.rfm_segment) {
        return await rpc(db, "marketing_rfm_contacts", {
          p_segment: String(a.rfm_segment),
          p_location_ids: ids(a.location_ids),
          p_limit: limite,
        });
      }
      let definicao = a.definition;
      if (!definicao && a.segment_id) {
        const { data, error } = await db.from("marketing_segment")
          .select("definition")
          .eq("id", String(a.segment_id))
          .is("deleted_at", null)
          .maybeSingle();
        if (error) throw error;
        if (!data) throw new Error("Segmento não encontrado.");
        definicao = data.definition;
      }
      if (!definicao) throw new Error("Informe segment_id, definition ou rfm_segment.");
      return {
        contatos: await rpc(db, "marketing_segment_contacts", {
          p_definition: definicao,
          p_location_ids: ids(a.location_ids),
          p_limit: limite,
        }),
      };
    }

    case "marketing_get_contact": {
      const chave = contactKeyFrom(a);
      const { data: contato, error } = await db.from("marketing_contact")
        .select("*")
        .eq("contact_key", chave)
        .is("deleted_at", null)
        .maybeSingle();
      if (error) throw error;
      if (!contato) throw new Error("Contato não encontrado na base de marketing.");
      const { data: doc } = await db.rpc("marketing_contact_doc", { p_location_ids: null })
        .eq("contact_key", chave)
        .maybeSingle();
      const { data: rfm } = await db.rpc("marketing_contact_rfm", { p_location_ids: null, p_window_days: null })
        .eq("contact_key", chave)
        .maybeSingle();
      const reservas = await rows(
        db.from("marketing_booking_fact")
          .select("booking_id, status, is_purchase, created_at, check_in_at, check_out_at, total_amount, location_id, utm_source, origin")
          .eq("contact_key", chave)
          .order("created_at", { ascending: false })
          .limit(20),
      );
      const leads = await rows(
        db.from("marketing_lead")
          .select("id, title, stage_id, booking_id, auto_synced, created_at, stage:stage_id(name, stage_key)")
          .eq("contact_id", contato.id)
          .is("deleted_at", null),
      );
      const mensagens = await rows(
        db.from("marketing_message")
          .select("id, campaign_id, channel, status, subject, error, sent_at, created_at")
          .eq("contact_id", contato.id)
          .order("created_at", { ascending: false })
          .limit(20),
      );
      return { contato, documento: doc?.doc ?? null, rfm, reservas, leads, mensagens };
    }

    case "marketing_list_campaigns":
      return {
        campanhas: await rows(
          db.from("marketing_campaign")
            .select("id, name, slug, status, segment_id, location_ids, send_cap, stats, started_at, finished_at, updated_at")
            .is("deleted_at", null)
            .order("updated_at", { ascending: false }),
        ),
      };

    case "marketing_get_campaign": {
      const { data: camp, error } = await db.from("marketing_campaign")
        .select("*, segment:segment_id(id, name, definition)")
        .eq("id", String(a.campaign_id))
        .is("deleted_at", null)
        .maybeSingle();
      if (error) throw error;
      if (!camp) throw new Error("Campanha não encontrada.");
      const matriculas = ((await rows(
        db.from("marketing_enrollment").select("status").eq("campaign_id", camp.id).limit(10000),
      )) as Array<{ status: string }> | null) ?? [];
      const porStatus: Record<string, number> = {};
      for (const m of matriculas) porStatus[m.status] = (porStatus[m.status] ?? 0) + 1;
      const mensagens = await rows(
        db.from("marketing_message")
          .select("id, channel, status, to_address, subject, error, sent_at, created_at")
          .eq("campaign_id", camp.id)
          .order("created_at", { ascending: false })
          .limit(20),
      );
      return {
        campanha: camp,
        matriculas: porStatus,
        problemas: validateCanvas(camp.canvas as Canvas).map((p) => p.message),
        mensagens,
      };
    }

    case "marketing_render_message": {
      const { data: camp, error } = await db.from("marketing_campaign")
        .select("id, canvas, segment:segment_id(definition)")
        .eq("id", String(a.campaign_id))
        .is("deleted_at", null)
        .maybeSingle();
      if (error) throw error;
      if (!camp) throw new Error("Campanha não encontrada.");
      const canvas = (camp.canvas ?? { nodes: [], edges: [] }) as Canvas;
      const node = canvas.nodes.find((n) => n.id === String(a.node_id));
      if (!node || (node.type !== "email" && node.type !== "whatsapp")) {
        throw new Error("Nó de envio (email ou whatsapp) não encontrado nesta campanha.");
      }
      let chave = a.contact_key ? String(a.contact_key) : null;
      if (!chave && camp.segment?.definition) {
        const amostra = ((await rpc(db, "marketing_segment_contacts", {
          p_definition: camp.segment.definition,
          p_location_ids: null,
          p_limit: 1,
        })) as Array<{ contact_key: string }> | null) ?? [];
        chave = amostra[0]?.contact_key ?? null;
      }
      let doc: Record<string, unknown> = {};
      if (chave) {
        const { data } = await db.rpc("marketing_contact_doc", { p_location_ids: null })
          .eq("contact_key", chave)
          .maybeSingle();
        doc = (data?.doc ?? {}) as Record<string, unknown>;
      }
      if (node.type === "email") {
        return {
          channel: "email",
          contact_key: chave,
          subject: renderMergeTags(String(node.data?.subject ?? ""), doc),
          body: renderMergeTags(String(node.data?.body ?? ""), doc, { escape: true }),
        };
      }
      return {
        channel: "whatsapp",
        contact_key: chave,
        template: String(node.data?.template ?? ""),
        params: Array.isArray(node.data?.params)
          ? (node.data?.params as string[]).map((p) => renderMergeTags(String(p), doc))
          : [],
      };
    }

    case "marketing_list_leads": {
      const cartoes = ((await rpc(db, "marketing_leads", {
        p_pipeline_id: null,
        p_location_ids: ids(a.location_ids),
        p_search: txt(a.search),
      })) as Array<Record<string, unknown>> | null) ?? [];
      if (!a.stage_key) return { leads: cartoes.slice(0, 200) };
      const etapas = ((await rows(
        db.from("marketing_pipeline_stage").select("id").eq("stage_key", String(a.stage_key)),
      )) as Array<{ id: string }> | null) ?? [];
      const alvo = new Set(etapas.map((e) => e.id));
      return { leads: cartoes.filter((c) => alvo.has(String(c.stage_id))).slice(0, 200) };
    }

    case "marketing_list_coupons":
      return { cupons: await rpc(db, "manager_list_platform_coupons") };

    case "marketing_get_dispatch_config":
      return await rpc(db, "marketing_dispatch_config");

    // ── Gravação ─────────────────────────────────────────────────────────────
    case "marketing_save_segment":
      return {
        segment_id: await rpc(db, "marketing_save_segment", {
          p_segment_id: txt(a.segment_id),
          p_name: String(a.name ?? ""),
          p_definition: a.definition,
          p_description: txt(a.description),
          p_location_ids: ids(a.location_ids),
          p_actor: ator,
        }),
      };

    case "marketing_delete_segment":
      await rpc(db, "marketing_delete_segment", { p_segment_id: String(a.segment_id), p_actor: ator });
      return { ok: true };

    case "marketing_save_campaign": {
      const id = (await rpc(db, "marketing_save_campaign", {
        p_campaign_id: txt(a.campaign_id),
        p_name: String(a.name ?? ""),
        p_segment_id: txt(a.segment_id),
        p_location_ids: ids(a.location_ids),
        p_canvas: a.canvas ?? null,
        p_send_cap: num(a.send_cap),
        p_actor: ator,
      })) as string;
      const { data: camp } = await db.from("marketing_campaign").select("canvas").eq("id", id).maybeSingle();
      const problemas = validateCanvas(
        (camp?.canvas ?? { nodes: [], edges: [] }) as Canvas,
      ).map((p) => p.message);
      return { campaign_id: id, ready: problemas.length === 0, problems: problemas };
    }

    case "marketing_set_campaign_status":
      await rpc(db, "marketing_set_campaign_status", {
        p_campaign_id: String(a.campaign_id),
        p_status: String(a.status),
        p_actor: ator,
      });
      return { ok: true };

    case "marketing_move_lead": {
      const { data: lead, error } = await db.from("marketing_lead")
        .select("id, pipeline_id, stage_id")
        .eq("id", String(a.lead_id))
        .is("deleted_at", null)
        .maybeSingle();
      if (error) throw error;
      if (!lead) throw new Error("Lead não encontrado.");
      const { data: etapa } = await db.from("marketing_pipeline_stage")
        .select("id")
        .eq("pipeline_id", lead.pipeline_id)
        .eq("stage_key", String(a.stage_key))
        .maybeSingle();
      if (!etapa) {
        throw new Error("Etapa não encontrada. Use descoberta, interesse, reserva_iniciada, cliente ou perdido.");
      }
      await rpc(db, "marketing_move_lead", { p_lead_id: lead.id, p_stage_id: etapa.id, p_sort_order: 0 });
      await audit(db, actor, "lead.move", "marketing_lead", lead.id, { stage_id: lead.stage_id }, {
        stage_id: etapa.id,
      });
      return { ok: true };
    }

    case "marketing_save_coupon": {
      let atual: Record<string, unknown> = {};
      if (a.coupon_id) {
        const { data, error } = await db.from("coupon")
          .select("*")
          .eq("id", String(a.coupon_id))
          .is("company_id", null)
          .maybeSingle();
        if (error) throw error;
        if (!data) throw new Error("Cupom da Movepark não encontrado.");
        atual = data;
      }
      const v = (k: string) => (k in a ? a[k] : atual[k]) ?? null;
      const id = await rpc(db, "manager_upsert_platform_coupon", {
        p_id: txt(a.coupon_id),
        p_code: v("code"),
        p_title: v("title"),
        p_description: v("description"),
        p_terms: v("terms"),
        p_discount_type: v("discount_type"),
        p_discount_value: v("discount_value"),
        p_max_discount_amount: v("max_discount_amount"),
        p_audience: v("audience") ?? "code_only",
        p_audience_inactive_days: v("audience_inactive_days"),
        p_valid_from: v("valid_from"),
        p_valid_until: v("valid_until"),
        p_max_uses: v("max_uses"),
        p_per_user_limit: v("per_user_limit"),
        p_min_amount: v("min_amount"),
        p_min_days: v("min_days"),
        p_is_active: v("is_active") ?? false,
        p_is_advertised: v("is_advertised") ?? false,
        p_sort_order: v("sort_order") ?? 0,
      });
      const { data: depois } = await db.from("coupon").select("*").eq("id", id).maybeSingle();
      await audit(db, actor, a.coupon_id ? "coupon.update" : "coupon.create", "coupon", String(id),
        a.coupon_id ? atual : null, depois);
      return { coupon_id: id };
    }

    case "marketing_set_coupon_active": {
      await rpc(db, "manager_set_platform_coupon_active", {
        p_coupon_id: String(a.coupon_id),
        p_is_active: a.active === true,
      });
      await audit(db, actor, "coupon.active", "coupon", String(a.coupon_id), null, {
        is_active: a.active === true,
      });
      return { ok: true };
    }

    case "marketing_set_dispatch_config":
      return await rpc(db, "marketing_set_dispatch_config", {
        p_test_recipient: txt(a.test_recipient),
        p_daily_cap: num(a.daily_cap),
        p_email_from: null,
        p_actor: ator,
      });

    // ── Disparo ──────────────────────────────────────────────────────────────
    case "marketing_run_campaign":
      return await run(db, String(a.campaign_id), { limit: num(a.limit) ?? undefined, actor });

    case "marketing_set_dispatch_enabled": {
      const r = (await rpc(db, "marketing_set_dispatch_enabled", {
        p_enabled: a.enabled === true,
        p_reason: String(a.reason ?? ""),
        p_actor: ator,
      })) as { changed: boolean; enabled: boolean } | null;
      if (r?.enabled && r.changed) {
        await deps.alertarDisparoLigado({ actorLabel: actor.label, reason: String(a.reason ?? "") });
      }
      return r;
    }

    default:
      throw new Error(`Tool desconhecida: ${name}`);
  }
}
