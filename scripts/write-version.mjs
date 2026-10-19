/**
 * Grava `dist/version.json` com o commit e a hora do build.
 *
 * Existe por causa de 15 a 19/10/2026: o site ficou quatro dias sem publicar e ninguém viu. O
 * Workers Builds falhava a cada push e a cada disparo de conteúdo (um link interno morto
 * reprovava o build), e a checagem diária só perguntava se o disparo tinha saído, não se o
 * deploy tinha acontecido. Com este arquivo no ar, a checagem compara o que está publicado com
 * a `main` e com o último disparo (`.github/workflows/site-rebuild-health.yml`).
 *
 * O commit vem do Workers Builds (`WORKERS_CI_COMMIT_SHA`); fora dele, do git local.
 */
import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";

function commitLocal() {
  try {
    return execSync("git rev-parse HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    return null;
  }
}

const versao = {
  commit: process.env.WORKERS_CI_COMMIT_SHA || commitLocal(),
  built_at: new Date().toISOString(),
  ci: process.env.WORKERS_CI === "1",
};
writeFileSync("dist/version.json", JSON.stringify(versao) + "\n");
console.log(`version.json: ${versao.commit ?? "sem commit"} em ${versao.built_at}`);
