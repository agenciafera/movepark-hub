// Testes da lógica de match da auditoria de endereço.
// Os casos vêm dos achados reais do E0.17-i (docs/specs/place-id-lote-mapeado.md): são eles
// que dizem por que cada regra existe.

import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildTextQuery,
  isAuthorized,
  isEstablishmentPlaceId,
  nameSimilarity,
  normalize,
  pickMatch,
  type PlaceCandidate,
} from "./logic.ts";

const base = (over: Partial<PlaceCandidate> = {}): PlaceCandidate => ({
  id: "ChIJtest",
  displayName: { text: "Aeropark Estacionamento" },
  formattedAddress: "R. Joaquina de Jesus, 745 - Guarulhos - SP",
  location: { latitude: -23.432, longitude: -46.499 },
  businessStatus: "OPERATIONAL",
  primaryType: "parking_lot",
  googleMapsUri: "https://maps.google.com/?cid=1",
  ...over,
});

Deno.test("normalize tira acento, caixa e pontuação", () => {
  assertEquals(normalize("Av. Novo Brasil, 954 - Satélite"), "avnovobrasil954satelite");
  assertEquals(normalize(null), "");
});

Deno.test("nome contido vale 1: o Google acrescenta descrição ao nome do lugar", () => {
  assertEquals(nameSimilarity("Aeropark", "Aeropark - Estacionamento Aeroporto Guarulhos"), 1);
});

Deno.test("nomes diferentes ficam abaixo do piso de aceite", () => {
  assert(nameSimilarity("Market Park", "Quality Hotel Aeroporto Vitória") < 0.6);
});

Deno.test("aceita o candidato de estacionamento operacional com nome forte", () => {
  const r = pickMatch(
    { name: "Aeropark", latitude: -23.4321, longitude: -46.4989 },
    [base()],
  );
  assert(r.accepted);
  assertEquals(r.place.id, "ChIJtest");
  assertEquals(r.similarity, 1);
});

Deno.test("recusa lugar fechado: era o caso do Arai Park, anunciado com as portas fechadas", () => {
  const r = pickMatch(
    { name: "Aeropark", latitude: -23.4321, longitude: -46.4989 },
    [base({ businessStatus: "CLOSED_TEMPORARILY" })],
  );
  assert(!r.accepted);
  assert(r.reason.includes("não operacional"));
});

Deno.test("recusa quem não é estacionamento: o Market Park resolvia para um hotel", () => {
  const r = pickMatch({ name: "Market Park", latitude: -20.25, longitude: -40.28 }, [
    base({ displayName: { text: "Market Park" }, primaryType: "lodging", types: ["lodging"] }),
  ]);
  assert(!r.accepted);
  assert(r.reason.includes("tipo não é estacionamento"));
});

Deno.test("park_and_ride conta como estacionamento: sem isso o Connect Park caía fora", () => {
  const r = pickMatch({ name: "Connect Park", latitude: -25.53, longitude: -49.17 }, [
    base({
      displayName: { text: "Connect Park" },
      primaryType: "park_and_ride",
      location: { latitude: -25.531, longitude: -49.172 },
    }),
  ]);
  assert(r.accepted);
});

Deno.test("nome forte tolera pino distante: quem estava errado era o nosso pino", () => {
  // Park Confins: o OSM tinha colocado o lote a mais de 3 km do lugar real.
  const r = pickMatch({ name: "Park Confins", latitude: -19.63, longitude: -43.97 }, [
    base({
      displayName: { text: "Park Confins Estacionamento" },
      location: { latitude: -19.6, longitude: -43.95 },
    }),
  ]);
  assert(r.accepted);
});

Deno.test("nome fraco não ganha a mesma folga de distância", () => {
  const r = pickMatch({ name: "Aero Park", latitude: -15.87, longitude: -47.92 }, [
    base({
      displayName: { text: "DF Parking Estacionamento" },
      location: { latitude: -15.78, longitude: -47.88 },
    }),
  ]);
  assert(!r.accepted);
});

Deno.test("unidade sem geo é aceita pelo nome: é a que mais precisa de um pino", () => {
  const r = pickMatch({ name: "Peu Park Zumbi dos Palmares", latitude: null, longitude: null }, [
    base({
      displayName: { text: "Peu Park Zumbi dos Palmares" },
      location: { latitude: -9.66, longitude: -35.7 },
    }),
  ]);
  assert(r.accepted);
});

Deno.test("lista vazia devolve o motivo, não uma exceção", () => {
  const r = pickMatch({ name: "Qualquer", latitude: null, longitude: null }, []);
  assert(!r.accepted);
  assertEquals(r.reason, "sem candidatos");
});

Deno.test("a busca junta nome e endereço, e aguenta endereço nulo", () => {
  assertEquals(buildTextQuery("Virapark", "Rod. Santos Dumont, km 64"), "Virapark, Rod. Santos Dumont, km 64");
  assertEquals(buildTextQuery("Virapark", null), "Virapark");
});

Deno.test("place_id de endereço não passa por place_id de estabelecimento", () => {
  assert(isEstablishmentPlaceId("ChIJC3FXyIVYzpQR0YwWxglmo5k"));
  // O que estava gravado na unidade do Guarulhos: Place ID codificado, de endereço.
  assert(!isEstablishmentPlaceId("EltBdi4gTm92byBCcmFzaWwsIDk1NA"));
  assert(!isEstablishmentPlaceId(null));
});

Deno.test("a chave de serviço recusa vazio, errado e tamanho diferente", () => {
  assert(isAuthorized("segredo", "segredo"));
  assert(!isAuthorized("segred0", "segredo"));
  assert(!isAuthorized("segredo", undefined));
  assert(!isAuthorized(null, "segredo"));
  assert(!isAuthorized("segredo-longo", "segredo"));
});
