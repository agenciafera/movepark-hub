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
   * A Edge roda em Deno e não enxerga `src/`, então `_shared/email.ts` mantém a
   * própria lista. É a mesma duplicação que deixou o telefone de suporte para
   * trás (ver `suporte.test.ts`), e ler o arquivo é o que impede a segunda vez.
   *
   * A comparação é por rede presente nos dois lados, e não por conjunto igual: o
   * rodapé do e-mail monta cada item como `<img>` de um PNG que precisa existir,
   * e o do Facebook ainda não foi desenhado.
   */
  it("as redes que existem nos dois lados apontam para o mesmo lugar", () => {
    const edge = readFileSync("supabase/functions/_shared/email.ts", "utf-8");
    const urlsDaEdge = [...edge.matchAll(/url:\s*"(https:\/\/[^"]+)"/g)].map((m) => m[1]);
    expect(urlsDaEdge.length).toBeGreaterThan(0);

    for (const plataforma of ["instagram", "linkedin"]) {
      const noSite = REDES.find((r) => r.url.includes(plataforma));
      const naEdge = urlsDaEdge.find((u) => u.includes(plataforma));
      expect(noSite, `${plataforma} sumiu do site`).toBeTruthy();
      expect(naEdge, `${plataforma} sumiu da Edge`).toBeTruthy();
      expect(naEdge).toBe(noSite!.url);
    }
  });

  /**
   * Guarda do ícone: cada rede do rodapé do e-mail vira `<img>` de
   * `/brand/social-<name>-email.png`. Somar uma rede lá sem o PNG deixa imagem
   * quebrada em todo e-mail transacional, e ninguém revisa rodapé de e-mail.
   */
  it("toda rede do e-mail tem o ícone correspondente no repo", () => {
    const edge = readFileSync("supabase/functions/_shared/email.ts", "utf-8");
    const bloco = edge.split("const SOCIAL")[1].split("];")[0];
    const nomes = [...bloco.matchAll(/name:\s*"(\w+)"/g)].map((m) => m[1]);

    expect(nomes.length).toBeGreaterThan(0);
    for (const nome of nomes) {
      const icone = `public/brand/social-${nome}-email.png`;
      expect(existsSync(icone), `falta ${icone}`).toBe(true);
    }
  });
});
