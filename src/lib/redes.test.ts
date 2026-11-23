import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { REDES } from "./redes";

describe("redes da marca", () => {
  it("toda rede tem nome e URL absoluta em https", () => {
    expect(REDES.length).toBeGreaterThan(0);
    for (const rede of REDES) {
      expect(rede.nome).toBeTruthy();
      expect(rede.url).toMatch(/^https:\/\//);
    }
  });

  /**
   * A URL numérica que circula internamente termina em `/admin/dashboard/` e é a
   * visão de administrador: visitante deslogado cai no muro de login. Conferido
   * em 14/08/2026 com requisição anônima, a vaidosa devolve "Movepark | LinkedIn"
   * e a numérica devolve a tela de entrar.
   */
  it("a LinkedIn é a URL pública, não a de administrador", () => {
    const linkedin = REDES.find((r) => r.nome === "LinkedIn");
    expect(linkedin?.url).toBe("https://www.linkedin.com/company/movepark");
    expect(linkedin?.url).not.toMatch(/\/admin\b|dashboard/);
  });

  /**
   * O rodapé do e-mail não tem mais redes sociais desde 23/11/2026: o casco ficou minimalista
   * para a marca Movepark não competir com a do estacionamento (docs/specs/logo-do-estacionamento.md).
   *
   * As duas guardas abaixo continuam valendo se a lista voltar. A Edge roda em Deno e não enxerga
   * `src/`, então `_shared/email.ts` mantém a própria lista: é a mesma duplicação que deixou o
   * telefone de suporte para trás (ver `suporte.test.ts`). E cada rede vira `<img>` de
   * `/brand/social-<name>-email.png`, que precisa existir, senão todo e-mail sai com imagem quebrada.
   */
  const edge = readFileSync("supabase/functions/_shared/email.ts", "utf-8");
  const temRedes = edge.includes("const SOCIAL");

  it("sem a lista de redes, o e-mail não referencia ícone de rede", () => {
    if (temRedes) return;
    expect(edge).not.toMatch(/social-\$\{|social-\w+-email\.png/);
  });

  it("com a lista de redes, as URLs batem com as do site", () => {
    if (!temRedes) return;
    const urlsDaEdge = [...edge.matchAll(/url:\s*"(https:\/\/[^"]+)"/g)].map((m) => m[1]);
    for (const plataforma of ["instagram", "linkedin"]) {
      const noSite = REDES.find((r) => r.url.includes(plataforma));
      const naEdge = urlsDaEdge.find((u) => u.includes(plataforma));
      if (naEdge) expect(naEdge).toBe(noSite?.url);
    }
  });

  it("com a lista de redes, toda rede tem o ícone no repo", () => {
    if (!temRedes) return;
    const bloco = edge.split("const SOCIAL")[1].split("];")[0];
    for (const [, nome] of bloco.matchAll(/name:\s*"(\w+)"/g)) {
      const icone = `public/brand/social-${nome}-email.png`;
      expect(existsSync(icone), `falta ${icone}`).toBe(true);
    }
  });
});
