// Edge Function: /submit-contact-message
// Formulário público de /contato. Grava a mensagem em `contact_message` e avisa a caixa
// de suporte por e-mail. Honeypot + validação; sem login.
//
// POST /functions/v1/submit-contact-message
// apikey: <ANON>  Authorization: Bearer <ANON>
// { name, email, message, page_url?, hp_field? }
//
// A gravação acontece ANTES do e-mail, e é o que define o sucesso da resposta. O SMTP é a
// parte que falha (credencial vencida, remetente não configurado, caixa cheia), e amarrar
// a resposta a ele faria a Movepark perder a mensagem junto com o aviso. Gravado primeiro,
// o pior caso é uma mensagem que ninguém foi avisado que chegou, e que continua no banco
// para ser respondida. O resultado do envio volta para a própria linha, em `email_status`.

// @ts-expect-error - Deno remote import
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  sendEmail,
  getContactConfig,
  tplContactReceived,
  tplContactAlert,
} from "../_shared/email.ts";
import { validateContact, type ContactInput } from "./validate.ts";

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

// @ts-expect-error - Deno global
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  let input: ContactInput;
  try {
    input = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400);
  }

  // Validação pura (honeypot, obrigatórios, e-mail, tamanho) — ver validate.ts.
  const v = validateContact(input);
  if (!v.ok) {
    if (v.status === 201) return jsonResponse({ ok: true }, 201); // honeypot
    return jsonResponse({ error: v.error }, 400);
  }
  const { name, email, message } = v.clean;

  const admin = createClient(
    // @ts-expect-error - Deno env
    Deno.env.get("SUPABASE_URL")!,
    // @ts-expect-error - Deno env
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const { data: gravada, error } = await admin
    .from("contact_message")
    .insert({
      name,
      email,
      message,
      page_url: input.page_url ?? null,
      user_agent: req.headers.get("user-agent"),
    })
    .select("id")
    .single();

  // Falha aqui é falha de verdade: sem registro, a mensagem não existe em lugar nenhum.
  if (error) {
    console.error("[contato] falha ao gravar mensagem:", error);
    return jsonResponse({ error: "Não foi possível registrar sua mensagem. Tente de novo." }, 500);
  }

  // E-mails em background: não bloqueiam nem derrubam o request.
  const emailJob = (async () => {
    let note = "";
    try {
      const { from, inbox } = await getContactConfig(admin);
      if (!from) {
        note = "sem remetente configurado";
      } else if (!inbox) {
        note = "sem caixa de suporte configurada";
      } else {
        const alerta = tplContactAlert({ name, email, message, pageUrl: input.page_url });
        const r = await sendEmail({
          from,
          to: inbox,
          subject: alerta.subject,
          html: alerta.html,
          // Responder o alerta cai direto em quem escreveu, sem copiar endereço na mão.
          replyTo: email,
        });
        note = `alerta→${inbox}: ${r.ok ? "ok" : r.error}`;

        const confirma = tplContactReceived(name);
        const r2 = await sendEmail({
          from,
          to: email,
          subject: confirma.subject,
          html: confirma.html,
        });
        note += ` | confirmação→${email}: ${r2.ok ? "ok" : r2.error}`;
      }
    } catch (mailErr) {
      note = `exceção: ${String(mailErr)}`;
      console.error("[contato] falha ao enviar e-mail (ignorado):", mailErr);
    }
    try {
      await admin
        .from("contact_message")
        .update({ email_status: `${new Date().toISOString()} ${note}` })
        .eq("id", gravada.id);
    } catch {
      /* diagnóstico não derruba nada */
    }
  })();
  try {
    // @ts-expect-error - EdgeRuntime global
    EdgeRuntime.waitUntil(emailJob);
  } catch {
    /* já roda em background */
  }

  return jsonResponse({ ok: true, id: gravada.id }, 201);
});
