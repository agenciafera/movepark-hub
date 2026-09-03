// Edge Function: /prospect-price-research
// Robô semanal de pesquisa de preço de concorrente (lote mapeado sem contrato).
//
// Para cada ficha que está sem preço ou perto de vencer: descobre o site pelo google_place_id
// (Places API), respeita o robots.txt do site, baixa a página, manda o texto ao Gemini e grava
// uma PROPOSTA em prospect_price_research. Nunca escreve em prospect_location: quem aplica é
// um hub_admin, pela RPC manager_price_research_decide.
//
// A proposta carrega a URL, o instante do acesso e o trecho literal da página. É essa prova
// que sustenta a afirmação publicada, e é ela que responde se o concorrente reclamar.
//
// Chamada interna pelo pg_cron (pg_net), header x-price-research-key. verify_jwt = false.
//
// A chave NÃO é segredo de Edge, ao contrário dos outros seis crons deste projeto: ela é
// gerada dentro do banco e conferida lá (`cron_key_matches`, que devolve booleano e nunca o
// segredo). Assim o valor não passa por terminal, CLI nem transcrição de sessão, e rotacionar
// é um UPDATE no Vault, sem redeploy da função.
//
// POST /functions/v1/prospect-price-research  (header: x-price-research-key: <KEY>)
// body opcional: { prospect_location_id?: uuid, limit?: number }  → útil para rodar na mão
// → { ok, candidates, proposals, failed, skipped }

// @ts-expect-error - Deno remote import
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { siteUrl } from "../_shared/site.ts";
import {
  buildPrompt,
  FICHAS_POR_PASSADA,
  htmlParaTexto,
  parseExtracao,
  RESPONSE_SCHEMA,
  robotsPermite,
  selectCandidatos,
  type Candidato,
} from "./logic.ts";

const MODEL = "gemini-2.5-flash";
const UA = "MoveparkPriceBot/1.0";
/** Orçamento da passada. A Edge derruba a invocação em 150s. */
const BUDGET_MS = 130000;
const PAGE_TIMEOUT_MS = 15000;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// @ts-expect-error - Deno env
const env = (k: string): string | undefined => Deno.env.get(k);

function userAgent(): string {
  return `${UA} (+${siteUrl()}/sobre)`;
}

async function comTimeout(url: string, ms: number): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, {
      headers: { "User-Agent": userAgent(), Accept: "text/html,application/xhtml+xml" },
      redirect: "follow",
      signal: ctrl.signal,
    });
  } finally {
    clearTimeout(t);
  }
}

/** O site publicado pelo próprio lugar no Google. Nulo quando ele não tem site. */
async function siteDoLote(placeId: string, googleKey: string): Promise<string | null> {
  const res = await fetch(
    `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}?languageCode=pt-BR&regionCode=BR`,
    {
      headers: {
        "X-Goog-Api-Key": googleKey,
        "X-Goog-FieldMask": "id,websiteUri",
        // Satisfaz a restrição por referrer quando a chave usada é a do projeto, igual ao
        // google-place-refresh.
        Referer: `${siteUrl()}/`,
      },
    },
  );
  if (!res.ok) throw new Error(`Places ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const body = (await res.json()) as { websiteUri?: string };
  const uri = body.websiteUri?.trim();
  if (!uri) return null;
  // Rede social não é tabela de preço, e ler perfil de terceiro para extrair número é outro
  // problema, não este.
  if (/facebook\.com|instagram\.com|linktr\.ee|wa\.me|api\.whatsapp\.com/i.test(uri)) return null;
  return uri;
}

async function robotsLibera(alvo: URL): Promise<boolean> {
  try {
    const res = await comTimeout(`${alvo.origin}/robots.txt`, 8000);
    // Sem robots.txt (404) o padrão do formato é liberar. Erro de servidor é o contrário:
    // não dá para afirmar que o dono permitiu, então a passada pula e tenta na próxima.
    if (res.status >= 400 && res.status < 500) return true;
    if (!res.ok) return false;
    return robotsPermite(await res.text(), alvo.pathname, UA);
  } catch {
    return false;
  }
}

async function extrair(
  apiKey: string,
  nome: string,
  cidade: string,
  texto: string,
): Promise<unknown> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: buildPrompt(nome, cidade, texto) }] }],
        generationConfig: {
          // Extração, não redação: temperatura zero e resposta obrigatoriamente no esquema.
          temperature: 0,
          responseMimeType: "application/json",
          responseSchema: RESPONSE_SCHEMA,
        },
      }),
    },
  );
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const body = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const raw = body.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!raw) throw new Error("Gemini devolveu resposta vazia");
  return JSON.parse(raw);
}

// @ts-expect-error - Deno global
Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const googleKey = env("GOOGLE_PLACES_SERVER_KEY");
  const geminiKey = env("GEMINI_API_KEY");
  if (!googleKey) return json({ error: "GOOGLE_PLACES_SERVER_KEY ausente" }, 500);
  if (!geminiKey) return json({ error: "GEMINI_API_KEY ausente" }, 500);

  const admin = createClient(env("SUPABASE_URL")!, env("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });

  const { data: autorizado } = await admin.rpc("cron_key_matches", {
    p_name: "prospect_price_research_key",
    p_key: req.headers.get("x-price-research-key") ?? "",
  });
  if (autorizado !== true) return json({ error: "unauthorized" }, 401);

  const body = (await req.json().catch(() => ({}))) as {
    prospect_location_id?: string;
    limit?: number;
  };

  const { data: fichas, error: erroFichas } = await admin
    .from("prospect_location")
    .select("id, name, google_place_id, researched_at, destination:destination_id(name)")
    .eq("is_published", true)
    .is("converted_at", null);
  if (erroFichas) return json({ error: erroFichas.message }, 500);

  const { data: propostas } = await admin
    .from("prospect_price_research")
    .select("prospect_location_id, status, created_at")
    .in("status", ["pending", "failed"]);

  const todas = (fichas ?? []) as (Candidato & { destination: { name: string } | null })[];
  const candidatos = body.prospect_location_id
    ? todas.filter((f) => f.id === body.prospect_location_id)
    : selectCandidatos(
        todas,
        propostas ?? [],
        new Date(),
        Math.min(body.limit ?? FICHAS_POR_PASSADA, 25),
      );

  const comecou = Date.now();
  let proposals = 0;
  let failed = 0;
  let skipped = 0;

  for (const ficha of candidatos) {
    if (Date.now() - comecou > BUDGET_MS) {
      skipped++;
      continue;
    }

    const registrar = async (linha: Record<string, unknown>) => {
      const { error } = await admin.from("prospect_price_research").insert({
        prospect_location_id: ficha.id,
        ...linha,
      });
      if (error) console.error(`price-research: ${ficha.name}: ${error.message}`);
    };

    try {
      const site = await siteDoLote(ficha.google_place_id!, googleKey);
      if (!site) {
        failed++;
        await registrar({ status: "failed", notes: "O lugar não publica site no Google." });
        continue;
      }

      const alvo = new URL(site);
      if (!(await robotsLibera(alvo))) {
        failed++;
        await registrar({
          status: "failed",
          source_url: site,
          notes: "O robots.txt do site não libera a leitura desta página.",
        });
        continue;
      }

      const pagina = await comTimeout(site, PAGE_TIMEOUT_MS);
      if (!pagina.ok) throw new Error(`Site respondeu ${pagina.status}`);
      const tipo = pagina.headers.get("content-type") ?? "";
      if (!/text\/html|application\/xhtml/i.test(tipo)) {
        throw new Error(`Site respondeu ${tipo || "sem content-type"}, não HTML`);
      }

      const texto = htmlParaTexto(await pagina.text());
      if (texto.length < 200) throw new Error("Página sem texto legível (provável SPA)");

      const fetchedAt = new Date().toISOString();
      const extracao = parseExtracao(
        await extrair(geminiKey, ficha.name, ficha.destination?.name ?? "", texto),
      );
      const temValor =
        extracao.daily_brl !== null ||
        extracao.weekly_brl !== null ||
        extracao.biweekly_brl !== null ||
        extracao.monthly_brl !== null;

      // Sem valor não vira decisão pendente: vira registro de tentativa. A fila de decisão
      // só mostra o que tem número para aprovar, e a ficha só volta em 30 dias.
      await registrar({
        status: temValor ? "pending" : "failed",
        source_url: site,
        fetched_at: fetchedAt,
        daily_brl: extracao.daily_brl,
        weekly_brl: extracao.weekly_brl,
        biweekly_brl: extracao.biweekly_brl,
        monthly_brl: extracao.monthly_brl,
        evidence: extracao.evidence,
        notes: extracao.notes,
        model: MODEL,
      });
      if (temValor) proposals++;
      else failed++;
    } catch (e) {
      failed++;
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`price-research: ${ficha.name}: ${msg}`);
      await registrar({ status: "failed", notes: msg.slice(0, 400) });
    }
  }

  return json({ ok: true, candidates: candidatos.length, proposals, failed, skipped });
});
