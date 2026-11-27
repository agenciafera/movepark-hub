import { assert, assertEquals } from "jsr:@std/assert";
import { jogadasDeHoje, oportunidadesDeHoje } from "./oportunidades.ts";

Deno.test("em 20/09/2026 nenhuma janela de envio abre em 14 dias", () => {
  assertEquals(jogadasDeHoje("2026-09-20").map((j) => j.chave), [
    "abandono_recente",
    "segunda_compra",
    "troca_flex",
    "indicacao",
  ]);
});

Deno.test("em 27/11/2026 a janela das férias de fim de ano abre em 11 dias", () => {
  const feriado = jogadasDeHoje("2026-11-27").find((j) => j.chave === "feriado")!;
  assertEquals(feriado.titulo, "Férias de fim de ano, por volta de 15/12");
});

Deno.test("em 14/12/2026 o feriado da vez é o Natal", () => {
  const feriado = jogadasDeHoje("2026-12-14").find((j) => j.chave === "feriado")!;
  assertEquals(feriado.titulo, "Natal em 25/12");
  assert(feriado.porQue.includes("18/12 a 22/12"));
});

Deno.test("toda regra das jogadas usa campo do catálogo do banco", () => {
  const pasta = new URL("../../../migrations/", import.meta.url);
  const arquivos = [...Deno.readDirSync(pasta)].map((f) => f.name).filter((n) => n.endsWith(".sql")).sort();
  const ultima = arquivos
    .filter((n) => Deno.readTextFileSync(new URL(n, pasta)).includes("function public.marketing_segment_fields()"))
    .at(-1)!;
  const sql = Deno.readTextFileSync(new URL(ultima, pasta));
  const doBanco = new Set([...sql.matchAll(/\('([a-z_0-9]+)', '(number|money|text|enum|boolean|tags)'/g)].map((m) => m[1]));
  for (const j of jogadasDeHoje("2026-12-14")) {
    for (const r of j.definition.rules) assert(doBanco.has(String(r.field)), `${j.chave}: campo ${r.field}`);
  }
});

Deno.test("a montagem tira a jogada sem público, mantém a ordem e repassa as unidades", async () => {
  const chamadas: Array<{ fn: string; args: Record<string, unknown> }> = [];
  const rpc = (fn: string, args: Record<string, unknown>) => {
    chamadas.push({ fn, args });
    return Promise.resolve([
      { chave: "abandono_recente", publico: 5, alcance_email: 4, ticket_medio: 190.83 },
      { chave: "segunda_compra", publico: 0, alcance_email: 0, ticket_medio: null },
      { chave: "troca_flex", publico: 6, alcance_email: 6, ticket_medio: 150 },
      { chave: "indicacao", publico: 7, alcance_email: 7, ticket_medio: 180 },
    ]);
  };
  const r = await oportunidadesDeHoje(rpc, ["l-1"], "2026-11-27");
  assertEquals(r.oportunidades.map((o) => o.chave), ["abandono_recente", "troca_flex", "indicacao"]);
  assertEquals(chamadas[0].fn, "marketing_segment_summaries");
  assertEquals(chamadas[0].args.p_location_ids, ["l-1"]);
  assertEquals(r.oportunidades[0].pedido, "Quero recuperar quem abandonou o checkout nas últimas 24 horas");
  assert(!JSON.stringify(r).includes("@"), "nenhum e-mail na saída");
});
