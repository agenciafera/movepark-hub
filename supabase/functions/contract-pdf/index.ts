// Edge Function: /contract-pdf
// Gera o PDF do contrato de parceria ACEITO por uma empresa, a partir do texto da versão aceita
// (`partner_contract_version`) e da prova gravada em `company` (versão, sha256, quem, quando, IP).
// Requer JWT de membro da empresa (qualquer papel) ou hub_admin. Só emite quando a prova bate
// com o texto da versão (hash igual); sem aceite ou com hash divergente responde 409.
//
// POST /functions/v1/contract-pdf
// Authorization: Bearer <JWT>
// { "company_id": "uuid" }
// → application/pdf (Content-Disposition: attachment; filename="contrato-parceria-movepark-<versão>.pdf")
//
// Não guarda o arquivo: o PDF é reproduzível a partir do banco (o hash prova o texto), e guardar
// uma cópia por download só criaria um segundo lugar para divergir.

// @ts-expect-error - Deno remote import
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildContractPdf } from "../_shared/contract/pdf.ts";
import {
  checkContractAccess,
  checkContractAuth,
  checkContractProof,
  contractPdfFilename,
  parseContractInput,
  type ContractCompanyRow,
  type ContractVersionRow,
} from "./logic.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Expose-Headers": "content-disposition",
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

  const authHeader = req.headers.get("Authorization");
  const authDenial = checkContractAuth(authHeader);
  if (authDenial) return jsonResponse({ error: authDenial.error }, authDenial.status);

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

  let parsedBody: unknown;
  try {
    parsedBody = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400);
  }
  const { input, error: inputErr } = parseContractInput(parsedBody);
  if (!input) return jsonResponse({ error: inputErr }, 400);

  const admin = createClient(SUPABASE_URL, SERVICE, { auth: { persistSession: false } });

  // Acesso: hub_admin ou membro da empresa.
  const { data: caller } = await admin
    .from("profiles")
    .select("role")
    .eq("id", userData.user.id)
    .maybeSingle();
  const { data: membership } = await admin
    .from("profile_company")
    .select("role")
    .eq("profile_id", userData.user.id)
    .eq("company_id", input.company_id)
    .maybeSingle();
  const accessDenial = checkContractAccess({ role: caller?.role, isMember: !!membership });
  if (accessDenial) return jsonResponse({ error: accessDenial.error }, accessDenial.status);

  // Prova do aceite + texto da versão aceita.
  const { data: company, error: coErr } = await admin
    .from("company")
    .select(
      "id, name, contract_accepted_at, contract_version, contract_sha256, contract_accepted_by, contract_accepted_ip",
    )
    .eq("id", input.company_id)
    .is("deleted_at", null)
    .maybeSingle();
  if (coErr) return jsonResponse({ error: coErr.message }, 500);

  let version: ContractVersionRow | null = null;
  if (company?.contract_version) {
    const { data: v } = await admin
      .from("partner_contract_version")
      .select("version, sha256, body")
      .eq("version", company.contract_version)
      .maybeSingle();
    version = (v as ContractVersionRow | null) ?? null;
  }
  const proofDenial = checkContractProof(company as ContractCompanyRow | null, version);
  if (proofDenial) return jsonResponse({ error: proofDenial.error }, proofDenial.status);

  // Qualificação do parceiro (razão social/CNPJ) e quem aceitou, quando existem.
  const [{ data: account }, { data: signer }] = await Promise.all([
    admin
      .from("company_payout_account")
      .select("legal_name, document")
      .eq("company_id", input.company_id)
      .is("deleted_at", null)
      .maybeSingle(),
    company!.contract_accepted_by
      ? admin
          .from("profiles")
          .select("first_name, last_name")
          .eq("id", company!.contract_accepted_by)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const signerName = signer
    ? [signer.first_name, signer.last_name].filter(Boolean).join(" ").trim() || null
    : null;

  const pdfBytes = await buildContractPdf({
    version: version!.version,
    sha256: version!.sha256,
    body: version!.body,
    companyName: company!.name,
    legalName: account?.legal_name ?? null,
    document: account?.document ?? null,
    acceptedAt: company!.contract_accepted_at!,
    acceptedByName: signerName,
    acceptedIp: company!.contract_accepted_ip ?? null,
  });

  return new Response(pdfBytes, {
    status: 200,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${contractPdfFilename(version!.version)}"`,
      "Cache-Control": "no-store",
    },
  });
});
