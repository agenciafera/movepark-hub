// Edge Function: /attach-identifier
// Anexa um identificador VERIFICADO (telefone/e-mail) à conta em sessão e, se ele já pertence a
// outra conta, funde-a (E0.10, ADR-006). A prova-de-posse é NOSSA (OTP custom via identifier_otp) —
// o OTP do GoTrue é amarrado ao login e não cobre um identificador já registrado.
//
// POST /functions/v1/attach-identifier   Authorization: Bearer <JWT da conta A>
//   { action: "request", channel: "phone"|"email", identifier }              → envia o código
//   { action: "confirm", channel, identifier, code, allow_merge?: boolean }  → verifica e anexa/funde
// Respostas do confirm: { status: "attached" | "merged" | "needs_merge_confirm", preview? }
//
// Decisão (ao confirmar o código): livre/própria → anexa; pertence a conta B vazia → funde;
// B com histórico → needs_merge_confirm (Q-006, tela "conectar contas") até allow_merge=true.

// @ts-expect-error - Deno remote import
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendWhatsAppTemplate, toWhatsAppNumber } from "../_shared/whatsapp.ts";
import { sendEmail, getEmailConfig } from "../_shared/email.ts";
import { isChannel, normalizeIdentifier, hashCode, genCode } from "./logic.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const OTP_TTL_MIN = 5;
const RESEND_COOLDOWN_SEC = 60;
const MAX_ATTEMPTS = 5;

// @ts-expect-error - Deno global
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return jsonResponse({ error: "Autenticação necessária" }, 401);

  // @ts-expect-error - Deno env
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  // @ts-expect-error - Deno env
  const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
  // @ts-expect-error - Deno env
  const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const userClient = createClient(SUPABASE_URL, ANON, {
    auth: { persistSession: false },
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData.user) return jsonResponse({ error: "Sessão inválida" }, 401);
  const uid = userData.user.id;

  const admin = createClient(SUPABASE_URL, SERVICE, { auth: { persistSession: false } });

  let body: {
    action?: string;
    channel?: string;
    identifier?: string;
    code?: string;
    allow_merge?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400);
  }

  const channel = body.channel;
  if (!isChannel(channel)) return jsonResponse({ error: "channel inválido" }, 400);
  const identifier = normalizeIdentifier(channel, body.identifier);
  if (!identifier) return jsonResponse({ error: "Identificador inválido" }, 400);

  // ── request: gera e envia o código ────────────────────────────────────────
  if (body.action === "request") {
    const { data: recent } = await admin
      .from("identifier_otp")
      .select("created_at")
      .eq("channel", channel)
      .eq("identifier", identifier)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (recent && Date.now() - new Date(recent.created_at).getTime() < RESEND_COOLDOWN_SEC * 1000) {
      return jsonResponse({ error: "Aguarde um instante antes de pedir outro código." }, 429);
    }

    const code = genCode();
    const code_hash = await hashCode(code);
    const expires_at = new Date(Date.now() + OTP_TTL_MIN * 60_000).toISOString();
    const { error: insErr } = await admin
      .from("identifier_otp")
      .insert({ channel, identifier, code_hash, requested_by: uid, expires_at });
    if (insErr) return jsonResponse({ error: insErr.message }, 500);

    if (channel === "phone") {
      const to = toWhatsAppNumber(identifier);
      if (!to) return jsonResponse({ error: "Telefone inválido" }, 400);
      // @ts-expect-error - Deno env
      const template = Deno.env.get("WHATSAPP_OFFICIAL_TEMPLATE_NAME") ?? "otp_movepark";
      // O template de OTP tem botão de copiar código, e a Meta recusa o envio sem o parâmetro dele
      // (131008). Mesmo flag do send-whatsapp-otp, para os dois fluxos falarem com o mesmo template.
      // @ts-expect-error - Deno env
      const otpButtonFlag = Deno.env.get("WHATSAPP_INCLUDE_OTP_BUTTON") ?? "false";
      const includeOtpButton = otpButtonFlag.toLowerCase() === "true";
      const r = await sendWhatsAppTemplate({
        to,
        template,
        bodyParams: [code],
        urlButtonParams: includeOtpButton ? [code] : [],
      });
      if (!r.ok) return jsonResponse({ error: "Não foi possível enviar o código por WhatsApp." }, 502);
    } else {
      const { from } = await getEmailConfig(admin);
      if (!from) return jsonResponse({ error: "E-mail não configurado" }, 503);
      const r = await sendEmail({
        from,
        to: identifier,
        subject: "Seu código de verificação Movepark",
        html: `<p>Seu código para conectar este e-mail à sua conta Movepark é:</p>
               <p style="font-size:24px;font-weight:700;letter-spacing:3px">${code}</p>
               <p>Expira em ${OTP_TTL_MIN} minutos. Se você não pediu, ignore.</p>`,
      });
      if (!r.ok) return jsonResponse({ error: "Não foi possível enviar o código por e-mail." }, 502);
    }
    return jsonResponse({ ok: true });
  }

  // ── confirm: verifica o código e anexa/funde ──────────────────────────────
  if (body.action === "confirm") {
    const code = typeof body.code === "string" ? body.code.trim() : "";
    if (!code) return jsonResponse({ error: "Código obrigatório" }, 400);

    const { data: otp } = await admin
      .from("identifier_otp")
      .select("id, code_hash, expires_at, attempts")
      .eq("channel", channel)
      .eq("identifier", identifier)
      .is("consumed_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!otp) return jsonResponse({ error: "Solicite um código primeiro." }, 400);
    if (new Date(otp.expires_at).getTime() < Date.now())
      return jsonResponse({ error: "Código expirado. Peça um novo." }, 400);
    if (otp.attempts >= MAX_ATTEMPTS)
      return jsonResponse({ error: "Muitas tentativas. Peça um novo código." }, 429);

    if ((await hashCode(code)) !== otp.code_hash) {
      await admin.from("identifier_otp").update({ attempts: otp.attempts + 1 }).eq("id", otp.id);
      return jsonResponse({ error: "Código incorreto." }, 400);
    }

    const consume = () =>
      admin.from("identifier_otp").update({ consumed_at: new Date().toISOString() }).eq("id", otp.id);
    const attachToA = async () => {
      const patch =
        channel === "phone"
          ? { phone: identifier, phone_confirm: true }
          : { email: identifier, email_confirm: true };
      const { error } = await admin.auth.admin.updateUserById(uid, patch);
      if (error) throw new Error(error.message);
    };

    // Dono atual do identificador (se houver).
    const { data: ownerB } = await admin.rpc("find_user_by_identifier", {
      p_channel: channel,
      p_identifier: identifier,
    });

    try {
      if (!ownerB || ownerB === uid) {
        await attachToA();
        await consume();
        return jsonResponse({ status: "attached" });
      }

      // Colisão: X pertence a outra conta B.
      const { data: hasHist } = await admin.rpc("account_has_history", { p_uid: ownerB });
      if (hasHist && body.allow_merge !== true) {
        const { data: preview } = await admin.rpc("merge_preview", { p_loser: ownerB });
        // NÃO consome — o usuário ainda vai confirmar na tela "conectar contas".
        return jsonResponse({ status: "needs_merge_confirm", preview });
      }

      // Funde B→A: reaponta os dados, libera o identificador (deleteUser B) e anexa em A.
      await admin.rpc("merge_accounts", { p_survivor: uid, p_loser: ownerB });
      const { error: delErr } = await admin.auth.admin.deleteUser(ownerB);
      if (delErr) throw new Error(delErr.message);
      await attachToA();
      await consume();
      return jsonResponse({ status: "merged" });
    } catch (e) {
      console.error("[attach-identifier] falha ao anexar/mesclar:", e);
      return jsonResponse({ error: e instanceof Error ? e.message : "Falha ao anexar identificador." }, 502);
    }
  }

  return jsonResponse({ error: "action inválida" }, 400);
});
