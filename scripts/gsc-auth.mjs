/**
 * Autenticação do Search Console para os coletores de `scripts/gsc-*.mjs`.
 *
 * Credencial: service account com acesso de leitura na propriedade, apontada por
 * `GSC_SERVICE_ACCOUNT_JSON` (caminho do arquivo ou o JSON inline) no `.env.local`.
 * O e-mail da service account precisa estar adicionado como usuário da propriedade no
 * Search Console.
 */

import crypto from "node:crypto";
import fs from "node:fs";

const ESCOPO = "https://www.googleapis.com/auth/webmasters.readonly";

export function carregarServiceAccount() {
  const bruto = process.env.GSC_SERVICE_ACCOUNT_JSON ?? process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!bruto) {
    throw new Error(
      "Falta a credencial. Defina GSC_SERVICE_ACCOUNT_JSON no .env.local com o caminho do JSON " +
        "da service account (ou o JSON inline) e adicione o e-mail dela como usuário da " +
        "propriedade no Search Console.",
    );
  }
  const conteudo = bruto.trim().startsWith("{") ? bruto : fs.readFileSync(bruto.trim(), "utf8");
  const sa = JSON.parse(conteudo);
  if (!sa.client_email || !sa.private_key) {
    throw new Error("JSON da service account sem client_email ou private_key.");
  }
  return sa;
}

const base64url = (dado) => Buffer.from(dado).toString("base64url");

/**
 * Troca a service account por um access token. É o fluxo JWT bearer do OAuth, feito à mão com
 * o `crypto` do Node para o script não arrastar uma dependência de SDK do Google só por isto.
 */
export async function pegarToken(sa) {
  const agora = Math.floor(Date.now() / 1000);
  const cabecalho = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const corpo = base64url(
    JSON.stringify({
      iss: sa.client_email,
      scope: ESCOPO,
      aud: sa.token_uri ?? "https://oauth2.googleapis.com/token",
      iat: agora,
      exp: agora + 3600,
    }),
  );
  const assinatura = crypto
    .createSign("RSA-SHA256")
    .update(`${cabecalho}.${corpo}`)
    .sign(sa.private_key)
    .toString("base64url");

  const resposta = await fetch(sa.token_uri ?? "https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${cabecalho}.${corpo}.${assinatura}`,
    }),
  });
  const dados = await resposta.json();
  if (!resposta.ok) {
    throw new Error(`Falha ao autenticar: ${resposta.status} ${JSON.stringify(dados)}`);
  }
  return dados.access_token;
}
