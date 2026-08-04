// E0.14 · Guarda de silêncio no e-mail de parceiro.
//
// Um único e-mail automático para uma empresa `silent` derruba a estratégia inteira, e é
// irreversível. Este arquivo cobre as duas metades da guarda:
//   1. sendPartnerEmail bloqueia empresa silenciosa e falha fechada quando não lê a empresa;
//   2. nenhum arquivo que use template de parceiro escapa pelo sendEmail cru.
//
// A segunda é a trava contra decaimento: template de parceiro novo já nasce coberto, sem
// depender de alguém lembrar de uma allowlist.

import { assert, assertEquals } from "jsr:@std/assert";
import { fromFileUrl } from "jsr:@std/path";
import { sendPartnerEmail } from "./email.ts";

/** Client mínimo que responde ao encadeamento from().select().eq().maybeSingle(). */
// deno-lint-ignore no-explicit-any
function fakeAdmin(result: { data: any; error: any }) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve(result),
        }),
      }),
    }),
  };
}

const mail = {
  from: "parceiros@movepark.co",
  to: "dono@estacionamento.com.br",
  subject: "Convite para a equipe",
  html: "<p>oi</p>",
};

Deno.test("empresa silenciosa não recebe e-mail", async () => {
  const r = await sendPartnerEmail(fakeAdmin({ data: { hub_relationship: "silent" }, error: null }), {
    companyId: "c-1",
    ...mail,
  });
  assertEquals(r.ok, false);
  assertEquals(r.silenced, true);
});

Deno.test("empresa não encontrada falha fechada (não envia)", async () => {
  const r = await sendPartnerEmail(fakeAdmin({ data: null, error: null }), {
    companyId: "c-inexistente",
    ...mail,
  });
  assertEquals(r.ok, false);
  assertEquals(r.silenced, undefined);
});

Deno.test("erro ao ler a empresa falha fechada (não envia)", async () => {
  const r = await sendPartnerEmail(fakeAdmin({ data: null, error: { message: "boom" } }), {
    companyId: "c-1",
    ...mail,
  });
  assertEquals(r.ok, false);
});

Deno.test("empresa onboarded segue para o envio (barra no SMTP, não na guarda)", async () => {
  // Sem credenciais de SMTP no ambiente de teste, sendEmail devolve {ok:false} com esse motivo.
  // O que importa aqui: a guarda deixou passar, então a mensagem chegou no transporte.
  for (const k of ["SES_SMTP_HOST", "SES_SMTP_USER", "SES_SMTP_PASS"]) Deno.env.delete(k);
  const r = await sendPartnerEmail(fakeAdmin({ data: { hub_relationship: "onboarded" }, error: null }), {
    companyId: "c-1",
    ...mail,
  });
  assertEquals(r.silenced, undefined);
  assertEquals(r.error, "SMTP não configurado");
});

// ── trava contra decaimento ────────────────────────────────────────────────
// Quem manda e-mail para PARCEIRO usa um destes templates. Se um arquivo usa um deles,
// tem que mandar pelo funil guardado.
const PARTNER_TEMPLATES = [
  "tplApprovalInvite",
  "tplRejection",
  "tplTeamInvite",
  "tplKycLinkIssued",
  "tplWentLive",
];

// email.ts é o lugar onde os templates nascem e onde sendEmail é definido; é a única exceção.
const DEFINITION_SITE = "_shared/email.ts";

async function* tsFiles(dir: string): AsyncGenerator<string> {
  for await (const entry of Deno.readDir(dir)) {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory) yield* tsFiles(path);
    else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) yield path;
  }
}

Deno.test("todo e-mail de parceiro passa pela guarda de silêncio", async () => {
  // fromFileUrl, e não .pathname: o caminho do repo tem espaço e viria como %20.
  const root = fromFileUrl(new URL("../", import.meta.url)).replace(/\/$/, "");
  const offenders: string[] = [];

  for await (const path of tsFiles(root)) {
    if (path.endsWith(DEFINITION_SITE)) continue;
    const src = await Deno.readTextFile(path);
    if (!PARTNER_TEMPLATES.some((t) => src.includes(t))) continue;
    if (/[^a-zA-Z]sendEmail\s*\(/.test(src)) offenders.push(path.replace(root, ""));
  }

  assert(
    offenders.length === 0,
    `e-mail de parceiro fora da guarda de silêncio (use sendPartnerEmail): ${offenders.join(", ")}`,
  );
});
