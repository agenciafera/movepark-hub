import { describe, expect, it } from "vitest";
import { parseValidade } from "./PaymentMethodForm.logic";

/** "hoje" fixo, para que o teste da borda do mês não dependa do dia em que roda. */
const HOJE = new Date("2026-08-04T12:00:00Z");

describe("parseValidade", () => {
  it("lê MM/AA e devolve o ano com quatro dígitos", () => {
    expect(parseValidade("11/29", HOJE)).toEqual({ mes: 11, ano: 2029 });
  });

  // Só dígitos e barra: a máscara do campo já descarta o resto antes de chegar aqui.
  it.each(["00/29", "13/29", "11/", "", "/29"])("recusa %s", (entrada) => {
    expect(parseValidade(entrada, HOJE)).toBeNull();
  });

  it("recusa ano que já passou", () => {
    expect(parseValidade("01/20", HOJE)).toBeNull();
    expect(parseValidade("12/25", HOJE)).toBeNull();
  });

  it("recusa mês que já passou dentro do ano corrente", () => {
    expect(parseValidade("07/26", HOJE)).toBeNull();
  });

  // O cartão vale até o último dia do mês impresso nele. Recusar 08/26 no dia 4
  // de agosto rejeitaria cartão bom, que é o erro caro dos dois.
  it("aceita o mês corrente, que ainda vale até o fim do mês", () => {
    expect(parseValidade("08/26", HOJE)).toEqual({ mes: 8, ano: 2026 });
  });

  it("aceita mês seguinte e anos à frente", () => {
    expect(parseValidade("09/26", HOJE)).toEqual({ mes: 9, ano: 2026 });
    expect(parseValidade("01/40", HOJE)).toEqual({ mes: 1, ano: 2040 });
  });
});
