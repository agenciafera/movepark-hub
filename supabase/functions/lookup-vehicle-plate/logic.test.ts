import { assertEquals } from "jsr:@std/assert";
import {
  buildLookupUrl,
  isValidPlate,
  mapColor,
  normalizeLookupResponse,
  normalizePlate,
} from "./logic.ts";

Deno.test("normalizePlate: tira máscara/espaço e sobe pra maiúscula", () => {
  assertEquals(normalizePlate(" abc-1d23 "), "ABC1D23");
  assertEquals(normalizePlate("eqh1120"), "EQH1120");
  assertEquals(normalizePlate("abc1234extra"), "ABC1234");
});

Deno.test("isValidPlate: aceita antiga e Mercosul, rejeita lixo", () => {
  assertEquals(isValidPlate("ABC1234"), true); // antiga
  assertEquals(isValidPlate("ABC1D23"), true); // Mercosul
  assertEquals(isValidPlate("EQH1120"), true);
  assertEquals(isValidPlate("AB1234"), false); // curta
  assertEquals(isValidPlate("1234ABC"), false); // ordem errada
  assertEquals(isValidPlate("ABCD123"), false); // 4º char não é dígito
});

Deno.test("mapColor: casa por substring, feminino e composta; desconhecida → Outro", () => {
  assertEquals(mapColor("CINZA"), "Cinza");
  assertEquals(mapColor("PRATA"), "Prata");
  assertEquals(mapColor("BRANCA"), "Branco"); // feminino
  assertEquals(mapColor("AZUL MARINHO"), "Azul"); // composta
  assertEquals(mapColor("VERMELHA"), "Vermelho");
  assertEquals(mapColor("MARRON"), "Marrom"); // grafia alternativa
  assertEquals(mapColor("AMARELA"), "Outro"); // sem opção → Outro
  assertEquals(mapColor(""), "Outro");
  assertEquals(mapColor(null), "Outro");
});

Deno.test("buildLookupUrl: monta a URL Strapi e escapa a placa", () => {
  assertEquals(
    buildLookupUrl("https://services.movepark.co", "EQH1120"),
    "https://services.movepark.co/api/vehicles/?filters[LicensePlate][$eq]=EQH1120&country=BRA",
  );
  // tolera barra final no base
  assertEquals(
    buildLookupUrl("https://services.movepark.co/", "EQH1120"),
    "https://services.movepark.co/api/vehicles/?filters[LicensePlate][$eq]=EQH1120&country=BRA",
  );
});

Deno.test("normalizeLookupResponse: data vazio → não encontrado", () => {
  assertEquals(normalizeLookupResponse({ data: [] }, "EQH1120"), { found: false });
  assertEquals(normalizeLookupResponse({}, "EQH1120"), { found: false });
});

Deno.test("normalizeLookupResponse: mapeia o 1º registro (Description→model, cor mapeada)", () => {
  const json = {
    data: [
      {
        id: 129180,
        attributes: {
          LicensePlate: "EQH1120",
          Brand: "HONDA",
          Model: "HONDA/FIT EX FLEX",
          Description: "HONDA/FIT EX FLEX",
          Color: "CINZA",
          RegistrationYear: "2010",
          Fuel: "ALCOOL / GASOLINA",
          Seats: "5",
          Type: "PASSAGEIRO",
        },
      },
    ],
  };
  assertEquals(normalizeLookupResponse(json, "eqh1120"), {
    found: true,
    vehicle: {
      license_plate: "EQH1120",
      model: "HONDA/FIT EX FLEX",
      color: "Cinza",
      raw_color: "CINZA",
      brand: "HONDA",
      year: "2010",
      fuel: "ALCOOL / GASOLINA",
    },
  });
});

Deno.test("normalizeLookupResponse: sem Description cai pra Model; sem plate usa a digitada", () => {
  const json = { data: [{ attributes: { Model: "FIAT/UNO", Color: "PRATA" } }] };
  const out = normalizeLookupResponse(json, "abc1d23");
  assertEquals(out.found, true);
  assertEquals(out.vehicle?.model, "FIAT/UNO");
  assertEquals(out.vehicle?.license_plate, "ABC1D23");
  assertEquals(out.vehicle?.color, "Prata");
});
