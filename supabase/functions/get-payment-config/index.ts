// Edge Function: /get-payment-config
// Config pública de pagamento para o checkout: a PUBLIC KEY do Pagar.me (tokenização client-side) e a
// POLÍTICA de parcelamento (app_setting, bloqueada por RLS para o consumidor). Sem auth (CORS aberto).
// A public key é publishable — seguro expor. verify_jwt = false no deploy.
//
// GET /functions/v1/get-payment-config
// → { public_key, installment_policy }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { parseInstallmentPolicy } from "../_shared/payments/installments.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const { data: setting } = await admin
    .from("app_setting")
    .select("value")
    .eq("key", "card_installment_policy")
    .maybeSingle();

  const policy = parseInstallmentPolicy(setting?.value);
  const publicKey = Deno.env.get("PAGARME_PUBLIC_KEY") ?? "";

  return new Response(
    JSON.stringify({ public_key: publicKey, installment_policy: policy }),
    {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=60",
      },
    },
  );
});
