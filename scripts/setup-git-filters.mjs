#!/usr/bin/env node
/**
 * Registra os filtros de git do repositório. Roda no `bun install` (script
 * `prepare`), junto do lefthook.
 *
 * Filtro só funciona se estiver configurado localmente: o `.gitattributes` diz
 * QUAL filtro usar, e o `git config` diz o QUE ele faz. Sem este passo o git
 * ignora a regra em silêncio, e o cache do Windup volta a sujar o `git status` a
 * cada replay.
 *
 * Falhar aqui não pode quebrar o `bun install`, então todo erro é avisado e
 * engolido. O pior caso é o incômodo antigo, nunca uma instalação quebrada.
 */

import { execFileSync } from "node:child_process";

const filtros = [
  {
    nome: "windup-cache",
    clean: "node scripts/windup-cache-clean.mjs",
    porque: "zera os contadores de replay do cache do Windup antes de o git ver o arquivo",
  },
];

try {
  execFileSync("git", ["rev-parse", "--git-dir"], { stdio: "ignore" });
} catch {
  // Instalação a partir de tarball, sem git. Nada a fazer.
  process.exit(0);
}

for (const f of filtros) {
  try {
    execFileSync("git", ["config", `filter.${f.nome}.clean`, f.clean]);
    // `smudge` é identidade: o arquivo em disco fica como o Windup escreveu.
    execFileSync("git", ["config", `filter.${f.nome}.smudge`, "cat"]);
  } catch (e) {
    console.warn(`[git-filters] não consegui registrar "${f.nome}": ${e.message}`);
    console.warn(`[git-filters] ${f.porque}`);
  }
}
