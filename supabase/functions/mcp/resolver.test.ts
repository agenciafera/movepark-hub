import { assertEquals } from "jsr:@std/assert";
import { resolverPerfil, superficieDoPath, type Verificacao } from "./resolver.ts";

/**
 * A matriz de resolução de credencial.
 *
 * Escrita antes do resolvedor, de propósito. O que ela substitui é um raciocínio
 * que não se sustentava: "o path protege". Enquanto a superfície vinha do path e
 * o registro de tools vinha da superfície, uma tool de Manager era inalcançável
 * para um parceiro **por construção**, e não por uma condicional estar certa. No
 * dia em que a credencial passar a escolher o perfil (fase 5), a condicional
 * vira a única barreira, e uma condicional só é confiável se for medida em todas
 * as entradas que ela aceita.
 *
 * Por isso a tabela cobre credencial má, credencial do tipo errado, credencial
 * no header errado, e as duas credenciais juntas. O caso que interessa não é a
 * chave boa: é a chave quase certa.
 *
 * Dimensões, sem produto cartesiano (seriam milhares de casos sem valor):
 *   1. superfície declarada no path
 *   2. o que vem em `Authorization` (o sujeito)
 *   3. o que vem em `X-API-Key` (o agente)
 */

// ── Dublê do banco ──────────────────────────────────────────────────────────
// O resolvedor recebe o lookup injetado, então a matriz roda sem rede.

const CHAVE_PARCEIRO = "mp_live_parceiro_abcdefghijk";
const CHAVE_PLATAFORMA = "mp_live_plataforma_abcdefgh";
const CHAVE_TESTE = "mp_test_parceiro_abcdefghijk";
const CHAVE_REVOGADA = "mp_live_revogada_abcdefghijk";
const CHAVE_EXPIRADA = "mp_live_expirada_abcdefghijk";
const CHAVE_INEXISTENTE = "mp_live_naoexiste_abcdefghi";

// JWTs: só a forma importa para o resolvedor, que não valida assinatura (quem
// valida é o GoTrue, no handler). O ponto aqui é ele NÃO confundir JWT com chave.
const JWT_USUARIO =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1LTEiLCJyb2xlIjoiYXV0aGVudGljYXRlZCJ9.assinatura";
const JWT_SERVICE_ROLE =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.assinatura";
const JWT_ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiJ9.assinatura";

let consultasAoBanco: string[] = [];

const verificar: Verificacao = (chave) => {
  consultasAoBanco.push(chave);
  switch (chave) {
    case CHAVE_PARCEIRO:
      return Promise.resolve({
        ok: true, api_key_id: "k-parceiro", company_id: "empresa-1",
        scopes: ["bookings:read", "bookings:write"], environment: "live",
      });
    case CHAVE_TESTE:
      return Promise.resolve({
        ok: true, api_key_id: "k-teste", company_id: "empresa-1",
        scopes: ["bookings:read", "bookings:write"], environment: "test",
      });
    case CHAVE_PLATAFORMA:
      return Promise.resolve({
        ok: true, api_key_id: "k-plataforma", company_id: null,
        scopes: ["blog:write", "checkout:link"], environment: "live",
      });
    case CHAVE_REVOGADA:
      return Promise.resolve({ ok: false, reason: "revoked" });
    case CHAVE_EXPIRADA:
      return Promise.resolve({ ok: false, reason: "expired" });
    default:
      return Promise.resolve({ ok: false, reason: "invalid_key" });
  }
};

type Caso = {
  nome: string;
  path: string;
  authorization?: string | null;
  xApiKey?: string | null;
  esperado: { perfil: string; status: number; escopos?: string[]; agente?: string | null };
};

async function resolver(c: Caso) {
  consultasAoBanco = [];
  return await resolverPerfil({
    path: c.path,
    authorization: c.authorization ?? null,
    xApiKey: c.xApiKey ?? null,
    verificar,
  });
}

// ── 1. Sem credencial ───────────────────────────────────────────────────────

const SEM_CREDENCIAL: Caso[] = [
  { nome: "raiz sem nada", path: "/", esperado: { perfil: "public", status: 200 } },
  { nome: "/customer sem nada continua servindo (login é pré-sessão)", path: "/customer",
    esperado: { perfil: "customer", status: 200 } },
  { nome: "/partner sem nada recusa", path: "/partner", esperado: { perfil: "public", status: 401 } },
  { nome: "/manager sem nada recusa", path: "/manager", esperado: { perfil: "public", status: 401 } },
];

Deno.test("sem credencial: público serve, superfície autenticada recusa", async () => {
  for (const c of SEM_CREDENCIAL) {
    const r = await resolver(c);
    assertEquals({ perfil: r.perfil, status: r.status }, c.esperado, c.nome);
    assertEquals(consultasAoBanco, [], `${c.nome}: não deve consultar o banco sem credencial`);
  }
});

// ── 2. O que NÃO é credencial ───────────────────────────────────────────────
// A regra: só é chave o que começa com `mp_`. O resto, no lugar do sujeito, é
// JWT (validado adiante) ou lixo. Nada disso pode chegar ao `api_key_verify`:
// `keyPrefix` são 16 caracteres, e todo JWT HS256 do Supabase começa com a mesma
// constante, o que transformaria o verify num oráculo de prefixo válido.

const NAO_E_CHAVE = ["Bearer ", "Bearer null", "Bearer undefined", "Bearer", "", "Basic abc"];

Deno.test("string que não é chave nunca chega ao banco", async () => {
  for (const auth of NAO_E_CHAVE) {
    const r = await resolver({ nome: auth, path: "/", authorization: auth, esperado: null as never });
    assertEquals(consultasAoBanco, [], `"${auth}" não pode ser consultada como chave`);
    assertEquals(r.perfil, "public", `"${auth}" não credencia ninguém`);
  }
});

Deno.test("JWT no lugar do sujeito não vira consulta de chave", async () => {
  for (const jwt of [JWT_USUARIO, JWT_SERVICE_ROLE, JWT_ANON]) {
    await resolver({ nome: "jwt", path: "/customer", authorization: `Bearer ${jwt}`, esperado: null as never });
    assertEquals(consultasAoBanco, [], "JWT não é chave de API e não pode ir ao verify");
  }
});

// ── 3. Chave de parceiro ────────────────────────────────────────────────────

Deno.test("chave de parceiro credencia o parceiro, e só ele", async () => {
  const emPartner = await resolver({
    nome: "parceiro no /partner", path: "/partner",
    authorization: `Bearer ${CHAVE_PARCEIRO}`, esperado: null as never,
  });
  assertEquals(emPartner.perfil, "partner");
  assertEquals(emPartner.status, 200);
  assertEquals(emPartner.escopos, ["bookings:read", "bookings:write"]);
  assertEquals(emPartner.companyId, "empresa-1");

  // A trava que não pode sumir: chave COM empresa não abre a superfície da
  // Movepark. Ela existe porque o escopo sozinho é uma aposta, e já houve um bug
  // que deixava um parceiro se conceder escopo de plataforma.
  const emManager = await resolver({
    nome: "parceiro no /manager", path: "/manager",
    authorization: `Bearer ${CHAVE_PARCEIRO}`, esperado: null as never,
  });
  assertEquals(emManager.perfil, "public");
  assertEquals(emManager.status, 401);
});

Deno.test("chave de plataforma credencia o Manager, e só ele", async () => {
  const emManager = await resolver({
    nome: "plataforma no /manager", path: "/manager",
    authorization: `Bearer ${CHAVE_PLATAFORMA}`, esperado: null as never,
  });
  assertEquals(emManager.perfil, "manager");
  assertEquals(emManager.status, 200);
  assertEquals(emManager.companyId, null);

  // O outro lado da mesma trava: a chave da Movepark não vira parceiro, onde o
  // `company_id` é o escopo de dados. Sem empresa, não há tenant a escopar.
  const emPartner = await resolver({
    nome: "plataforma no /partner", path: "/partner",
    authorization: `Bearer ${CHAVE_PLATAFORMA}`, esperado: null as never,
  });
  assertEquals(emPartner.perfil, "public");
  assertEquals(emPartner.status, 401);
});

// ── 4. Chave que não serve ──────────────────────────────────────────────────
// Inválida, revogada e expirada respondem igual. O motivo fica no log, nunca na
// resposta: senão o endpoint vira serviço de triagem de chave vazada.

Deno.test("inválida, revogada e expirada são indistinguíveis para quem chama", async () => {
  const respostas = [];
  for (const chave of [CHAVE_INEXISTENTE, CHAVE_REVOGADA, CHAVE_EXPIRADA]) {
    const r = await resolver({
      nome: chave, path: "/partner", authorization: `Bearer ${chave}`, esperado: null as never,
    });
    respostas.push({ perfil: r.perfil, status: r.status, escopos: r.escopos });
  }
  assertEquals(respostas[0], respostas[1]);
  assertEquals(respostas[1], respostas[2]);
  assertEquals(respostas[0], { perfil: "public", status: 401, escopos: [] });
});

Deno.test("o motivo da recusa existe para o log, e difere entre os casos", async () => {
  const r1 = await resolver({ nome: "x", path: "/partner", authorization: `Bearer ${CHAVE_REVOGADA}`, esperado: null as never });
  const r2 = await resolver({ nome: "x", path: "/partner", authorization: `Bearer ${CHAVE_EXPIRADA}`, esperado: null as never });
  assertEquals(r1.motivo === r2.motivo, false, "o log precisa distinguir revogada de expirada");
});

// ── 5. Duas credenciais ao mesmo tempo ──────────────────────────────────────
// `Authorization` é sempre o sujeito. `X-API-Key` é sempre o agente. Antes daqui
// `extractApiKey` preferia o Authorization e descartava o X-API-Key em silêncio,
// que é como um cliente mandava as duas e recebia um 401 sem explicação.

Deno.test("chave no header do sujeito e do agente ao mesmo tempo é erro explícito", async () => {
  const r = await resolver({
    nome: "duas chaves", path: "/partner",
    authorization: `Bearer ${CHAVE_PARCEIRO}`, xApiKey: CHAVE_PLATAFORMA, esperado: null as never,
  });
  assertEquals(r.status, 400);
  assertEquals(r.perfil, "public");
});

Deno.test("JWT no sujeito e chave de agente é o par legítimo do /customer", async () => {
  const r = await resolver({
    nome: "usuário mais agente", path: "/customer",
    authorization: `Bearer ${JWT_USUARIO}`, xApiKey: CHAVE_PLATAFORMA, esperado: null as never,
  });
  assertEquals(r.perfil, "customer");
  assertEquals(r.status, 200);
  // Os escopos vêm do AGENTE, não do usuário: é o que libera create_checkout_link.
  assertEquals(r.escopos, ["blog:write", "checkout:link"]);
});

Deno.test("chave de agente inválida no /customer não derruba a sessão, só não dá escopo", async () => {
  // Degradação silenciosa aqui é deliberada: o `X-API-Key` é opcional, e quem
  // não o manda vale tanto quanto quem o manda errado. O que ele nunca faz é
  // credenciar.
  const r = await resolver({
    nome: "agente ruim", path: "/customer",
    authorization: `Bearer ${JWT_USUARIO}`, xApiKey: CHAVE_INEXISTENTE, esperado: null as never,
  });
  assertEquals(r.perfil, "customer");
  assertEquals(r.status, 200);
  assertEquals(r.escopos, []);
});

Deno.test("chave de agente com empresa não vale como agente confiável", async () => {
  // `checkout:link` é escopo de plataforma, e o trigger de tabela impede que uma
  // chave de empresa o carregue. Esta é a segunda porta, no código: mesmo que a
  // flag do catálogo mude um dia, a chave de parceiro não vira agente.
  const r = await resolver({
    nome: "agente de empresa", path: "/customer",
    authorization: `Bearer ${JWT_USUARIO}`, xApiKey: CHAVE_PARCEIRO, esperado: null as never,
  });
  assertEquals(r.perfil, "customer");
  assertEquals(r.escopos, []);
});

// ── 6. Ambiente da chave ────────────────────────────────────────────────────

Deno.test("o ambiente da chave viaja na resolução", async () => {
  const live = await resolver({ nome: "live", path: "/partner", authorization: `Bearer ${CHAVE_PARCEIRO}`, esperado: null as never });
  const teste = await resolver({ nome: "test", path: "/partner", authorization: `Bearer ${CHAVE_TESTE}`, esperado: null as never });
  assertEquals(live.environment, "live");
  assertEquals(teste.environment, "test");
  // Ambas credenciam: o que o ambiente decide é o que a tool pode fazer, e isso
  // é o gate de escrita, não a resolução.
  assertEquals(teste.perfil, "partner");
});

// ── 7. Path desconhecido ────────────────────────────────────────────────────

Deno.test("path que não é superfície não vira superfície", async () => {
  const r = await resolver({ nome: "path esquisito", path: "/admin", esperado: null as never });
  assertEquals(r.perfil, "public");
  assertEquals(r.status, 404);
});

// ── 8. Invariante: nenhuma entrada promove sozinha ──────────────────────────

Deno.test("nenhuma combinação alcança manager sem chave de plataforma", async () => {
  const entradas: Array<{ path: string; authorization: string | null; xApiKey: string | null }> = [];
  for (const path of ["/", "/partner", "/customer", "/manager", "/desconhecido"]) {
    for (const auth of [null, `Bearer ${CHAVE_PARCEIRO}`, `Bearer ${CHAVE_TESTE}`,
                        `Bearer ${JWT_USUARIO}`, `Bearer ${JWT_SERVICE_ROLE}`,
                        `Bearer ${CHAVE_REVOGADA}`, "Bearer null", "lixo"]) {
      for (const x of [null, CHAVE_PARCEIRO, CHAVE_INEXISTENTE]) {
        entradas.push({ path, authorization: auth, xApiKey: x });
      }
    }
  }
  let virouManager = 0;
  for (const e of entradas) {
    const r = await resolverPerfil({ ...e, verificar });
    if (r.perfil === "manager") virouManager++;
  }
  assertEquals(virouManager, 0, `${entradas.length} combinações sem chave de plataforma, nenhuma vira manager`);
});

Deno.test("nenhuma combinação alcança partner sem chave de empresa válida", async () => {
  let virouPartner = 0;
  for (const path of ["/", "/partner", "/customer", "/manager"]) {
    for (const auth of [null, `Bearer ${CHAVE_PLATAFORMA}`, `Bearer ${JWT_USUARIO}`,
                        `Bearer ${CHAVE_EXPIRADA}`, "Bearer null"]) {
      const r = await resolverPerfil({ path, authorization: auth, xApiKey: null, verificar });
      if (r.perfil === "partner") virouPartner++;
    }
  }
  assertEquals(virouPartner, 0);
});

// ── 9. Os dois caminhos reais até o mesmo servidor ──────────────────────────
// Pelo worker chega `/partner`; direto no Supabase chega
// `/functions/v1/mcp/partner`, que é como a Edge `chat` chama. Se a normalização
// errar, o caminho direto vira `public` e a superfície inteira se abre.

Deno.test("path do worker e path direto do Supabase resolvem igual", async () => {
  const pares: Array<[string, string, string]> = [
    ["/", "/functions/v1/mcp", "public"],
    ["/partner", "/functions/v1/mcp/partner", "partner"],
    ["/customer", "/functions/v1/mcp/customer", "customer"],
    ["/manager", "/functions/v1/mcp/manager", "manager"],
  ];
  for (const [viaWorker, direto, esperado] of pares) {
    assertEquals(superficieDoPath(viaWorker), esperado, viaWorker);
    assertEquals(superficieDoPath(direto), esperado, direto);
    assertEquals(superficieDoPath(direto + "/"), esperado, direto + " com barra");
  }
});

Deno.test("sufixo desconhecido não vira superfície por nenhum dos caminhos", async () => {
  for (const p of ["/admin", "/functions/v1/mcp/admin", "/partner/extra", "/manageR"]) {
    assertEquals(superficieDoPath(p), null, p);
  }
});

// ── 10. O motivo, que a auditoria vai usar ──────────────────────────────────
//
// Descoberto por mutação: trocar "lixo" por "JWT" na classificação do sujeito
// não muda perfil, status nem escopo, porque nas superfícies sem chave o perfil
// vem do path e o escopo vem do agente. A distinção só existe no `motivo`.
//
// Isso é verdade hoje e é aceitável, mas precisa ficar preso: o `motivo` é o que
// responde "quantas credenciais inválidas apareceram" quando a auditoria de
// falha entrar. Sem esta asserção, a classificação pode degradar em silêncio e
// só o log fica errado, que é o tipo de defeito que ninguém percebe.

Deno.test("o motivo distingue anônimo, JWT e credencial recusada", async () => {
  const anonimo = await resolver({ nome: "x", path: "/", esperado: null as never });
  const comJwt = await resolver({ nome: "x", path: "/", authorization: `Bearer ${JWT_USUARIO}`, esperado: null as never });
  const lixo = await resolver({ nome: "x", path: "/", authorization: "Bearer nao-e-nada", esperado: null as never });

  assertEquals(anonimo.motivo, "anonimo");
  assertEquals(comJwt.motivo, "sujeito_jwt");
  // Lixo não é sujeito: ele não pode se passar por sessão no log.
  assertEquals(lixo.motivo, "anonimo");

  const recusadas = [];
  for (const [chave, esperado] of [
    [CHAVE_INEXISTENTE, "chave_invalid_key"],
    [CHAVE_REVOGADA, "chave_revoked"],
    [CHAVE_EXPIRADA, "chave_expired"],
  ] as const) {
    const r = await resolver({ nome: "x", path: "/partner", authorization: `Bearer ${chave}`, esperado: null as never });
    assertEquals(r.motivo, esperado);
    recusadas.push(r.status);
  }
  // Motivos diferentes no log, resposta idêntica para quem chama.
  assertEquals(recusadas, [401, 401, 401]);
});

Deno.test("chave no header errado deixa rastro próprio", async () => {
  const r = await resolver({
    nome: "x", path: "/manager", authorization: `Bearer ${CHAVE_PARCEIRO}`, esperado: null as never,
  });
  assertEquals(r.motivo, "chave_fora_da_superficie_manager");
});
