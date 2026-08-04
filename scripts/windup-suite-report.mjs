#!/usr/bin/env node
/**
 * Gera o .windup/reports/suite.html a partir de duas fontes:
 *   - .windup/reports/windup-report.json   (resultado da corrida: PASS/FAIL, cache, tempos)
 *   - .windup/cache/trajetorias/*.json     (o plano provado de cada cenário, ação a ação)
 *
 * O relatório nativo do Windup não abre o plano, e é justamente o plano que
 * mostra o que cada cenário prova. Por isso os dois são cruzados aqui.
 *
 * Uso:
 *   bunx windup run --all --base-url http://localhost:5273 --reporter json
 *   node scripts/windup-suite-report.mjs
 */
import fs from "node:fs";
import path from "node:path";

const RAIZ = path.resolve(import.meta.dirname, "..");
const RELATORIO = path.join(RAIZ, ".windup/reports/windup-report.json");
const CACHE = path.join(RAIZ, ".windup/cache/trajetorias");
const CENARIOS = path.join(RAIZ, "e2e/windup");
const SAIDA = path.join(RAIZ, ".windup/reports/suite.html");

if (!fs.existsSync(RELATORIO)) {
  console.error("Sem windup-report.json. Rode antes:");
  console.error("  bunx windup run --all --base-url http://localhost:5273 --reporter json");
  process.exit(1);
}

const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c],
  );
const ms = (n) => `${Math.round(n)} ms`;
const pct = (n) => `${Math.round(n * 100)}%`;

const { summary, cases } = JSON.parse(fs.readFileSync(RELATORIO, "utf8"));

/** Descreve o que uma ação faz, em uma linha legível. */
function descreve(a) {
  const alvo = a.target?.description || a.target?.selector || "";
  if (a.type === "goto") return `abre ${a.url || alvo}`;
  if (a.type === "fill") return `preenche ${alvo} com "${a.value ?? ""}"`;
  if (a.type === "click") return `clica em ${alvo}`;
  return alvo;
}

/** Traduz a postcondição para a frase do que ela prova. */
function prova(e) {
  if (!e) return "";
  if (e.text_contains) return `texto "${e.text_contains.text}" em ${e.text_contains.selector}`;
  if (e.selector_value) return `campo ${e.selector_value.selector} vale "${e.selector_value.value}"`;
  if (e.not_visible) return `${e.not_visible.selector || e.not_visible} sumiu da tela`;
  if (e.url) return `url casa ${e.url.equals || e.url.contains || e.url.matches || ""}`;
  if (e.count) return `${e.count.selector} aparece ${e.count.equals ?? e.count.min ?? "?"}x`;
  if (e.attribute)
    return `atributo ${e.attribute.name} de ${e.attribute.selector} = "${e.attribute.equals ?? ""}"`;
  if (e.selector) return `existe ${e.selector}`;
  return Object.keys(e).join(", ");
}

const planos = new Map();
if (fs.existsSync(CACHE)) {
  for (const f of fs.readdirSync(CACHE).filter((x) => x.endsWith(".json"))) {
    const j = JSON.parse(fs.readFileSync(path.join(CACHE, f), "utf8"));
    if (j.plan?.scenario_id) planos.set(j.plan.scenario_id, j.plan);
  }
}

const metas = new Map();
for (const f of fs.readdirSync(CENARIOS).filter((x) => x.endsWith(".json"))) {
  const j = JSON.parse(fs.readFileSync(path.join(CENARIOS, f), "utf8"));
  if (j.scenario_id) metas.set(j.scenario_id, j);
}

const totalAcoes = [...planos.values()].reduce((s, p) => s + (p.actions?.length || 0), 0);
const media = planos.size ? (totalAcoes / planos.size).toFixed(1) : "0";
const autenticados = [...metas.values()].filter((m) => m.seed || m.network).length;

const linhas = cases
  .slice()
  .sort((a, b) => a.scenario.localeCompare(b.scenario))
  .map((c) => {
    const plano = planos.get(c.scenario);
    const meta = metas.get(c.scenario);
    const acoes = plano?.actions || [];
    const b = c.duration_breakdown || {};
    const seg = (chave, cor) => {
      const v = b[chave] || 0;
      if (!v) return "";
      const w = ((v / c.duration_ms) * 100).toFixed(1);
      return `<span class="seg seg-${cor}" style="width:${w}%" title="${chave} ${ms(v)}"></span>`;
    };
    const tabelaAcoes = acoes.length
      ? `<details><summary>${acoes.length} ação(ões)</summary><table class="actions">
<tr><th>id</th><th>tipo</th><th>o que faz</th><th>o que prova</th></tr>
${acoes
  .map(
    (a) =>
      `<tr><td>${esc(a.id)}</td><td class="act-type">${esc(a.type)}</td><td class="act-what">${esc(descreve(a))}</td><td class="act-what">${esc(prova(a.expect))}</td></tr>`,
  )
  .join("\n")}
</table></details>`
      : "";
    const tags = (meta?.tags || []).map((t) => `<span class="tag">${esc(t)}</span>`).join(" ");
    const falha = c.failure
      ? `<div class="fail-msg">${esc(c.failure.message || JSON.stringify(c.failure))}</div>`
      : "";
    return `<tr class="${c.result === "passed" ? "" : "row-fail"}">
<td><span class="badge ${c.result === "passed" ? "pass" : "fail"}">${c.result === "passed" ? "PASS" : "FAIL"}</span></td>
<td class="scenario">${esc(c.scenario)} ${tags}
<details class="breakdown"><summary>${ms(c.duration_ms)} — onde o tempo foi</summary>
<div class="bar">${seg("setup", "setup")}${seg("planning", "plan")}${seg("navigation", "nav")}${seg("actions", "actions")}${seg("contention", "other")}</div></details>
${tabelaAcoes}${falha}</td>
<td>${esc(c.cache)}</td>
<td class="n">${c.llm_calls}</td>
<td class="n">${acoes.length}</td>
<td class="n">${ms(c.duration_ms)}</td>
</tr>`;
  })
  .join("\n");

const agora = new Date().toISOString().slice(0, 16).replace("T", " ");
const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Windup — ${summary.passed}/${summary.total} passando</title>
<style>
:root { --bg:#faf8f3; --card:#fff; --ink:#262218; --muted:#6e6653; --line:#e6dfce; --accent:#a87710; --pass:#2f7d4f; --pass-bg:#e3f0e7; --fail:#b5432e; --fail-bg:#f7e5e0; }
@media (prefers-color-scheme: dark) { :root { --bg:#16130e; --card:#1f1b14; --ink:#eae3d2; --muted:#9c9480; --line:#332c20; --accent:#d9a441; --pass:#63c08d; --pass-bg:#1c2f24; --fail:#e0745f; --fail-bg:#34201b; } }
* { box-sizing:border-box; }
body { margin:0; padding:32px 20px 60px; background:var(--bg); color:var(--ink); font:14px/1.5 "Avenir Next","Segoe UI",system-ui,sans-serif; }
main { max-width:1040px; margin:0 auto; }
h1 { font-size:22px; margin:0; letter-spacing:-.01em; }
.sub { color:var(--muted); font-size:12.5px; margin:4px 0 20px; }
.summary { display:flex; flex-wrap:wrap; gap:10px; margin-bottom:22px; }
.stat { background:var(--card); border:1px solid var(--line); border-radius:10px; padding:10px 14px; min-width:96px; }
.stat b { display:block; font-size:19px; }
.stat span { color:var(--muted); font-size:11.5px; }
.stat.p b { color:var(--pass); } .stat.f b { color:var(--fail); }
.table-wrap { background:var(--card); border:1px solid var(--line); border-radius:12px; overflow-x:auto; }
table { border-collapse:collapse; width:100%; }
th, td { text-align:left; padding:8px 12px; border-bottom:1px solid var(--line); vertical-align:top; font-size:13px; }
th { color:var(--muted); font-weight:600; font-size:11.5px; text-transform:uppercase; letter-spacing:.04em; }
td.n, th.n { text-align:right; font-variant-numeric:tabular-nums; }
.badge { display:inline-block; padding:1px 7px; border-radius:5px; font-size:11px; font-weight:700; }
.badge.pass { background:var(--pass-bg); color:var(--pass); }
.badge.fail { background:var(--fail-bg); color:var(--fail); }
.row-fail { background:var(--fail-bg); }
.scenario { font-weight:600; }
.tag { display:inline-block; background:var(--bg); border:1px solid var(--line); color:var(--muted); border-radius:20px; padding:0 7px; font-size:10.5px; font-weight:500; }
details { margin-top:5px; font-weight:400; }
summary { cursor:pointer; color:var(--muted); font-size:11.5px; }
table.actions { margin-top:6px; background:var(--bg); border-radius:8px; }
table.actions th, table.actions td { font-size:11.5px; padding:4px 8px; border-bottom:1px solid var(--line); }
.act-type { color:var(--accent); font-family:ui-monospace,SFMono-Regular,Menlo,monospace; }
.act-what { color:var(--muted); }
.bar { display:flex; height:6px; border-radius:3px; overflow:hidden; background:var(--line); margin-top:4px; max-width:340px; }
.seg-setup { background:#9c9480; } .seg-plan { background:var(--accent); } .seg-nav { background:#6b8fb5; } .seg-actions { background:var(--pass); } .seg-other { background:var(--line); }
.fail-msg { margin-top:6px; font-family:ui-monospace,Menlo,monospace; font-size:11px; color:var(--fail); white-space:pre-wrap; }
</style>
</head>
<body>
<main>
<h1>Windup — suíte do Movepark Hub</h1>
<p class="sub">gerado em ${agora} UTC · replay determinístico, LLM só quando o cache erra</p>
<div class="summary">
<div class="stat"><b>${summary.total}</b><span>cenários</span></div>
<div class="stat p"><b>${summary.passed}</b><span>passando</span></div>
<div class="stat f"><b>${summary.failed}</b><span>falhando</span></div>
<div class="stat"><b>${totalAcoes}</b><span>ações</span></div>
<div class="stat"><b>${media}</b><span>ações/cenário</span></div>
<div class="stat"><b>${autenticados}</b><span>com sessão</span></div>
<div class="stat"><b>${pct(summary.cache_hit_rate)}</b><span>cache-hit</span></div>
<div class="stat"><b>${summary.llm_calls}</b><span>chamadas de LLM</span></div>
<div class="stat"><b>$${summary.est_cost_usd.toFixed(4)}</b><span>custo</span></div>
<div class="stat"><b>${(summary.wall_ms / 1000).toFixed(1)}s</b><span>relógio · ×${summary.concurrency}</span></div>
</div>
<div class="table-wrap">
<table>
<tr><th></th><th>Cenário</th><th>Cache</th><th class="n">LLM</th><th class="n">Ações</th><th class="n">Duração</th></tr>
${linhas}
</table>
</div>
</main>
</body>
</html>
`;

fs.writeFileSync(SAIDA, html);
console.log(
  `suite.html: ${summary.passed}/${summary.total} passando, ${totalAcoes} ações (média ${media}) -> ${path.relative(RAIZ, SAIDA)}`,
);
