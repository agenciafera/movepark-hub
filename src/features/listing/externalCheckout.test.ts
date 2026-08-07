import { describe, expect, it } from "vitest";
import { withSearchDates } from "./externalCheckout";

const BASE =
  "https://virapark.movepark.co/virapark/vaga-coberta?utm_source=movepark&utm_medium=organic&utm_campaign=afiliado-movepark";

const FROM = new Date("2026-08-12T16:00:00.000Z");
const TO = new Date("2026-08-21T16:00:00.000Z");

describe("withSearchDates", () => {
  it("acrescenta as datas no formato que o white-label aceita", () => {
    expect(withSearchDates(BASE, FROM, TO)).toBe(
      BASE + "&startDateTime=2026-08-12T16%3A00%3A00.000Z&endDateTime=2026-08-21T16%3A00%3A00.000Z",
    );
  });

  it("a marcação de afiliado sobrevive intacta ao append", () => {
    // É a diferença entre 17% e 9% de participação naquela venda, e some sem nenhum relatório
    // acusar. Por isso o append é literal, sem passar por URL/URLSearchParams.
    const url = withSearchDates(BASE, FROM, TO)!;
    expect(url).toContain("utm_source=movepark");
    expect(url).toContain("utm_medium=organic");
    expect(url).toContain("utm_campaign=afiliado-movepark");
    expect(url.startsWith(BASE)).toBe(true);
  });

  it("sem datas, devolve a URL como veio do servidor", () => {
    expect(withSearchDates(BASE, null, null)).toBe(BASE);
  });

  it("com só uma das datas, não manda meia seleção", () => {
    expect(withSearchDates(BASE, FROM, null)).toBe(BASE);
    expect(withSearchDates(BASE, null, TO)).toBe(BASE);
  });

  it("data inválida não vira 'Invalid Date' na query", () => {
    const url = withSearchDates(BASE, new Date("nada"), TO);
    expect(url).toBe(BASE);
  });

  it("sem URL base não inventa link", () => {
    expect(withSearchDates(null, FROM, TO)).toBeNull();
    expect(withSearchDates(undefined, FROM, TO)).toBeNull();
    expect(withSearchDates("", FROM, TO)).toBeNull();
  });

  it("usa ? quando a base não tem query", () => {
    expect(withSearchDates("https://x.test/a/b", FROM, TO)).toBe(
      "https://x.test/a/b?startDateTime=2026-08-12T16%3A00%3A00.000Z&endDateTime=2026-08-21T16%3A00%3A00.000Z",
    );
  });

  it("carrega o mesmo instante que o Hub reservaria", () => {
    // O fluxo de reserva monta check_in_at com from.toISOString(). Se o link divergisse, a
    // nossa página mostraria um horário e o parceiro abriria outro.
    const url = withSearchDates(BASE, FROM, TO)!;
    expect(url).toContain(encodeURIComponent(FROM.toISOString()));
    expect(url).toContain(encodeURIComponent(TO.toISOString()));
  });
});
