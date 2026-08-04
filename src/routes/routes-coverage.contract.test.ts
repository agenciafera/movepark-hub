import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Inventário de cobertura de rota: toda rota de `src/routes.tsx` é aberta por
 * algum teste de navegador?
 *
 * A cobertura é lida do `start_url` dos cenários Windup, que é declarativo e
 * exato. O Playwright entra como lista fixa, mantida à mão, porque lá a
 * navegação é montada em template literal e por helper (`listingUrl()`), e
 * parsear isso daria um guard frágil que erra para os dois lados.
 *
 * SEM_COBERTURA é o placar da Fase 6 do plano. Só encolhe: ao escrever o
 * cenário, remova a rota daqui no mesmo commit.
 */

const ROUTES_TSX = join(process.cwd(), "src", "routes.tsx");
const WINDUP = join(process.cwd(), "e2e", "windup");

/**
 * Rotas cobertas pelo Playwright, e o motivo de não serem Windup. Manter à mão
 * é de propósito: cada entrada aqui é uma decisão, não um efeito colateral.
 */
const COBERTAS_POR_PLAYWRIGHT: Record<string, string> = {
  "/search": "busca com fixture de destino real (support/consumer.ts)",
  "/p/:operatorSlug/:locationSlug/:parkingTypeCode": "detalhe com preço vivo do banco",
  "/bookings": "lista do cliente logado com reserva real",
  "/bookings/:code": "detalhe de reserva real",
  "/checkout/:code": "checkout transacional, cobra no Pagar.me",
  "/voucher/validate": "check-in por QR com reserva confirmada",
  "/onboarding": "wizard com upload de foto",
  "/auth/callback": "magic link real (support/session.ts)",
  "/manager/companies": "aprovação de parceiro que dispara e-mail",
  "/manager/partners": "kanban com arrasto HTML5",
  "/operator/bookings": "drawer de operação com reserva real",
  "/operator/finance": "bounce de escopo, rebaixa papel na fixture",
  "/operator/occupancy": "ocupação com capacidade real",
  "/operator/pricing": "escreve preço de parceiro real",
  "/operator/recebimento": "KYC com upload de documento",
  "/operator/preview/:locationId": "preview pós-publicação, depende do wizard",
};

/** Rotas que nenhum teste de navegador abre. Só encolhe. */
/**
 * Vazia: toda rota declarada em routes.tsx tem cenário de navegador, seja Windup
 * (o padrão) ou Playwright (o mapa acima, com o motivo escrito). Uma rota nova
 * entra aqui só com data e motivo, e sai no commit que escreve o cenário.
 */
const SEM_COBERTURA: string[] = [];

/**
 * Resolve os `path:` de routes.tsx. Filha é relativa ao pai, e o pai sempre
 * aparece antes dela no arquivo, então o último path absoluto visto é o prefixo.
 */
function rotasDeclaradas(): string[] {
  const source = readFileSync(ROUTES_TSX, "utf8");
  let base = "";
  const rotas: string[] = [];
  for (const m of source.matchAll(/path:\s*"([^"]*)"/g)) {
    const p = m[1];
    if (p.startsWith("/")) {
      base = p;
      rotas.push(p);
    } else if (p === "*") {
      rotas.push("*");
    } else {
      rotas.push((base === "/" ? "" : base) + "/" + p);
    }
  }
  return [...new Set(rotas)];
}

/** Uma URL cobre uma rota quando os segmentos casam, com `:param` como coringa. */
function casa(rota: string, url: string): boolean {
  // O catch-all não tem endereço literal: o que o cobre é um cenário que abre
  // uma rota inexistente de propósito e prova o redirecionamento. Reconhece-se
  // por qualquer url que nenhuma outra rota declarada consiga casar.
  if (rota === "*") return url.startsWith("/essa-rota-nao-existe");
  const limpa = url.split("?")[0].replace(/\/$/, "") || "/";
  const r = rota.split("/").filter(Boolean);
  const u = limpa.split("/").filter(Boolean);
  return r.length === u.length && r.every((seg, i) => seg.startsWith(":") || seg === u[i]);
}

const rotas = rotasDeclaradas();
const startUrls = readdirSync(WINDUP)
  .filter((f) => f.endsWith(".json"))
  .map((f) => JSON.parse(readFileSync(join(WINDUP, f), "utf8")).start_url ?? "/");

const inventario = rotas.map((rota) => ({
  rota,
  cobertaPorWindup: startUrls.some((u) => casa(rota, u)),
  cobertaPorPlaywright: rota in COBERTAS_POR_PLAYWRIGHT,
}));

describe("inventário de cobertura de rota", () => {
  it("resolve um conjunto de rotas não-vazio", () => {
    expect(rotas.length).toBeGreaterThan(60);
  });

  it("nenhuma rota nova entra sem cobertura de navegador", () => {
    const novas = inventario
      .filter((r) => !r.cobertaPorWindup && !r.cobertaPorPlaywright && !SEM_COBERTURA.includes(r.rota))
      .map((r) => r.rota);
    expect(novas).toEqual([]);
  });

  it("a allowlist não guarda rota que já ganhou cenário", () => {
    const cobertas = inventario
      .filter((r) => (r.cobertaPorWindup || r.cobertaPorPlaywright) && SEM_COBERTURA.includes(r.rota))
      .map((r) => r.rota);
    expect(cobertas).toEqual([]);
  });

  it("nenhuma lista guarda rota que deixou de existir", () => {
    const declaradas = new Set(rotas);
    const orfas = [...SEM_COBERTURA, ...Object.keys(COBERTAS_POR_PLAYWRIGHT)].filter(
      (r) => !declaradas.has(r),
    );
    expect(orfas).toEqual([]);
  });
});
