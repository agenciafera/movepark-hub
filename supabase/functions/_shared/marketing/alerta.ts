// Aviso à equipe quando a chave geral do disparo de marketing é ligada fora do painel Disparo real
// (pelo MCP ou pelo assistente da tela de Automação). Usado pelas duas Edges. Nunca lança: o aviso
// não pode derrubar a ação que já aconteceu. Spec: docs/specs/marketing-mcp.md § 6.

import { getEmailConfig, sendEmail, tplMarketingDispatchEnabled } from "../email.ts";

// deno-lint-ignore no-explicit-any
export async function alertarDisparoLigado(admin: any, info: { actorLabel: string; reason: string }) {
  try {
    const { data } = await admin.from("app_setting").select("value")
      .eq("key", "team_daily_digest_recipients").maybeSingle();
    const para = String(data?.value ?? "").split(",").map((s: string) => s.trim()).filter(Boolean);
    const { from } = await getEmailConfig(admin);
    if (para.length === 0 || !from) return;
    const quando = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
    const mail = tplMarketingDispatchEnabled({ ...info, quando });
    await sendEmail({ from, to: para, subject: mail.subject, html: mail.html });
  } catch (e) {
    console.warn("[marketing] aviso de disparo ligado falhou:", e instanceof Error ? e.message : e);
  }
}
