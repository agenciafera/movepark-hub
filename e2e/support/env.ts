/**
 * Carrega e valida os envs da suíte E2E.
 *
 * Ordem de carga: `.env` (versionado, só chaves públicas) e depois `.env.e2e`
 * (local, com o service_role e os e-mails dos usuários de teste). O `.env.e2e`
 * sobrescreve o `.env`.
 *
 * O Playwright roda sob Node, que não carrega `.env` sozinho como o bun faz.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "../..");

function loadEnvFile(file: string) {
  const full = path.join(ROOT, file);
  if (!fs.existsSync(full)) return;
  process.loadEnvFile(full);
}

loadEnvFile(".env");
loadEnvFile(".env.e2e");

function required(name: string, hint: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `[e2e] Falta o env ${name}.\n` + `      ${hint}\n` + `      Veja e2e/README.md e .env.e2e.example.`,
    );
  }
  return value;
}

export const env = {
  /**
   * URL onde o app responde. Default: dev server próprio da suíte, numa porta
   * separada da 5173 de propósito. Assim a suíte nunca reaproveita um
   * `bun run dev` aberto na mão, que sobe com a chave do Google e mudaria o
   * caminho do passo 1 do wizard de publicação (ver T-07).
   */
  baseUrl: process.env.E2E_BASE_URL ?? "http://localhost:5273",

  supabaseUrl: required("VITE_SUPABASE_URL", "Deveria vir do .env versionado."),
  supabaseAnonKey: required("VITE_SUPABASE_ANON_KEY", "Deveria vir do .env versionado."),
  serviceRoleKey: required(
    "SUPABASE_SERVICE_ROLE_KEY",
    "Pegue em Supabase > Project Settings > API e ponha no .env.e2e (nunca commite).",
  ),

  managerEmail: process.env.E2E_MANAGER_EMAIL ?? "developer@fera.ag",
  operatorEmail: process.env.E2E_OPERATOR_EMAIL ?? "peu+mercy@fera.ag",
} as const;

/** Ref do projeto Supabase, extraído da URL. Usado em mensagens de erro. */
export const projectRef = new URL(env.supabaseUrl).hostname.split(".")[0];

/**
 * Guarda de ambiente. A suíte hoje aponta para o banco de produção com a
 * fixture Mercy, então todo destroy passa por `db.ts`, que só age no escopo
 * da fixture. Esta função existe para deixar o alvo explícito no log.
 */
export function describeTarget() {
  return `app=${env.baseUrl} supabase=${projectRef}`;
}
