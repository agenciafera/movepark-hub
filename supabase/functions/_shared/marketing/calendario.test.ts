import { assertEquals } from "jsr:@std/assert";
import { calendario, hojeEmBrasilia, pascoa } from "./calendario.ts";

Deno.test("Páscoa de 2026 e 2027", () => {
  assertEquals(pascoa(2026), "2026-04-05");
  assertEquals(pascoa(2027), "2027-03-28");
});

Deno.test("feriados móveis de 2026 e 2027 batem com o calendário oficial", () => {
  const datas = calendario("2026-01-01", 366).concat(calendario("2027-01-01", 366));
  const em = (nome: string, ano: string) => datas.find((d) => d.nome === nome && d.data.startsWith(ano))?.data;
  assertEquals(em("Carnaval", "2026"), "2026-02-17");
  assertEquals(em("Corpus Christi", "2026"), "2026-06-04");
  assertEquals(em("Carnaval", "2027"), "2027-02-09");
  assertEquals(em("Sexta-feira Santa", "2027"), "2027-03-26");
  assertEquals(em("Corpus Christi", "2027"), "2027-05-27");
});

Deno.test("de 27/11/2026, os próximos 90 dias em ordem", () => {
  assertEquals(calendario("2026-11-27", 90).map((d) => d.nome), [
    "Férias de fim de ano",
    "Natal",
    "Ano Novo",
    "Carnaval",
  ]);
});

Deno.test("a janela do Natal vai de 7 a 3 dias antes", () => {
  const natal = calendario("2026-11-27", 90).find((d) => d.nome === "Natal")!;
  assertEquals([natal.janela_de, natal.janela_ate, natal.abre_em_dias], ["2026-12-18", "2026-12-22", 21]);
});

Deno.test("hoje é o dia de Brasília, não o de UTC", () => {
  assertEquals(hojeEmBrasilia(new Date("2026-11-28T02:30:00Z")), "2026-11-27");
});
