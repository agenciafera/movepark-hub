import { describe, expect, it } from "vitest";
import { renderWithProviders } from "@/test/utils";
import { TrustBand } from "./TrustBand";

/**
 * Trava do ADR-009 na home.
 *
 * A home não recebe unidade nenhuma, então não tem como chamar
 * `getLocationCapabilities`. A consequência prática é que promessa de vaga
 * garantida simplesmente não pode nascer aqui: ela renderizaria para toda a
 * base, inclusive para as unidades de saída externa, onde quem controla a
 * disponibilidade é o parceiro. O ADR chama essa promessa de inegociável.
 *
 * O teste lê `textContent`, e não `getByText`, de propósito: as ilustrações são
 * `aria-hidden`, então as queries acessíveis não as alcançam, mas quem enxerga
 * lê o texto e a oferta vincula o fornecedor do mesmo jeito (CDC art. 30). Foi
 * exatamente por esse ponto cego que o diálogo do card de atendimento prometeu
 * "sua vaga fica garantida por 3h após o horário previsto".
 */
const PROMESSAS_PROIBIDAS: { nome: string; padrao: RegExp }[] = [
  { nome: "vaga garantida", padrao: /vagas?\s+(\w+\s+){0,2}garantidas?/i },
  { nome: "garantia de vaga", padrao: /garant(imos|ia|ida)\s+(a|de|da|sua)\s+vaga/i },
  { nome: "prazo de tolerância", padrao: /\d+\s*h(oras?)?\s+(ap[óo]s|depois|de\s+toler)/i },
  { nome: "tolerância de atraso", padrao: /toler[âa]ncia/i },
];

describe("TrustBand (home): ADR-009", () => {
  it("não promete vaga garantida nem prazo em nenhum texto, visível ou ilustrativo", () => {
    const { container } = renderWithProviders(<TrustBand />);
    const texto = container.textContent ?? "";

    for (const { nome, padrao } of PROMESSAS_PROIBIDAS) {
      expect(texto, `promessa proibida na home: ${nome}`).not.toMatch(padrao);
    }
  });

  it("o card de atendimento continua mostrando que alguém responde", () => {
    // O conserto do ADR é tirar a promessa, não esvaziar o card. Se um dia o
    // diálogo sumir inteiro, este teste avisa que o diferencial ficou sem
    // ilustração em vez de deixar passar calado.
    const { container } = renderWithProviders(<TrustBand />);
    const texto = container.textContent ?? "";

    expect(texto).toContain("Ajuda a qualquer hora");
    expect(texto).toMatch(/Meu voo atrasou/i);
    expect(texto).toMatch(/Te explico agora as condi[çc][õo]es da sua reserva/i);
  });
});
