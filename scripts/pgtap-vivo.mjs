#!/usr/bin/env node
// Roda um teste pgTAP contra o banco vivo sem deixar rastro (sem Docker).
//
// Uso: node scripts/pgtap-vivo.mjs supabase/tests/<teste>.test.sql [migration.sql]
//
// Monta uma transação: cria a extensão pgtap, uma temp table para o TAP, aplica a migration
// opcional (para ver o RED/GREEN antes de aplicar de verdade), roda o corpo do teste e termina com
// uma exceção que carrega o TAP inteiro. A exceção desfaz tudo. Receita aferida em 02/10/2026.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const [teste, migration] = process.argv.slice(2);
if (!teste) {
  console.error("Uso: node scripts/pgtap-vivo.mjs <teste.sql> [migration.sql]");
  process.exit(2);
}

let corpo = readFileSync(teste, "utf8")
  .replace(/^\s*begin;\s*$/im, "")
  .replace(/^\s*select \* from finish\(\);\s*$/im, "")
  .replace(/^\s*rollback;\s*$/im, "");
// Cada asserção de topo vira uma linha na temp table.
corpo = corpo.replace(
  /^select (is|isnt|ok|throws_ok|lives_ok|results_eq|has_table|has_function)\(/gim,
  "insert into _tap(line) select $1(",
);

const sql = [
  "begin;",
  "create extension if not exists pgtap;",
  "create temp table _tap(id serial, line text);",
  "grant insert, select on _tap to authenticated, anon;",
  "grant usage on sequence _tap_id_seq to authenticated, anon;",
  migration ? readFileSync(migration, "utf8") : "",
  corpo,
  "do $$ begin raise exception E'TAP\\n%', (select string_agg(line, E'\\n' order by id) from _tap); end $$;",
].join("\n");

const arquivo = join(mkdtempSync(join(tmpdir(), "pgtap-")), "run.sql");
writeFileSync(arquivo, sql);
try {
  execFileSync("supabase", ["db", "query", "--linked", "-f", arquivo], { stdio: "pipe" });
  console.error("O teste terminou sem a exceção do TAP: confira o arquivo.");
  process.exit(1);
} catch (e) {
  const saida = String(e.stdout ?? "") + String(e.stderr ?? "");
  const i = saida.indexOf("TAP");
  if (i === -1) {
    console.error(saida.slice(0, 2000));
    process.exit(1);
  }
  const tap = saida.slice(i);
  console.log(tap);
  process.exit(/not ok/.test(tap) ? 1 : 0);
}
