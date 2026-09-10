import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  haversineKm,
  isAuthorized,
  mapPlaceDetails,
  nameSimilarity,
  normalizeName,
  type PlaceCandidate,
  pickPlaceMatch,
  REFRESH_AFTER_DAYS,
  RETRY_LOOKUP_AFTER_DAYS,
  selectStale,
} from "./logic.ts";

const NOW = new Date("2026-08-14T12:00:00Z");

Deno.test("selectStale: place sem snapshot entra", () => {
  assertEquals(selectStale(["A"], [], NOW), ["A"]);
});

Deno.test("selectStale: snapshot mais novo que 7 dias fica de fora", () => {
  const snaps = [{ place_id: "A", fetched_at: "2026-08-12T12:00:00Z" }];
  assertEquals(selectStale(["A"], snaps, NOW), []);
});

Deno.test("selectStale: snapshot com mais de 7 dias entra", () => {
  const snaps = [{ place_id: "A", fetched_at: "2026-08-05T12:00:00Z" }];
  assertEquals(selectStale(["A"], snaps, NOW), ["A"]);
});

Deno.test("selectStale: a janela e de 7 dias", () => {
  assertEquals(REFRESH_AFTER_DAYS, 7);
});

Deno.test("selectStale: snapshot com exatamente 7 dias entra (fronteira usa >, nao >=)", () => {
  const snaps = [{ place_id: "A", fetched_at: "2026-08-07T12:00:00Z" }];
  assertEquals(selectStale(["A"], snaps, NOW), ["A"]);
});

Deno.test("isAuthorized: sem header e recusado", () => {
  assertEquals(isAuthorized(null, "segredo"), false);
});

Deno.test("isAuthorized: header errado e recusado", () => {
  assertEquals(isAuthorized("errado", "segredo"), false);
});

Deno.test("isAuthorized: header correto e aceito", () => {
  assertEquals(isAuthorized("segredo", "segredo"), true);
});

Deno.test("isAuthorized: expected ausente ou vazio nunca autoriza", () => {
  assertEquals(isAuthorized("qualquer", undefined), false);
  assertEquals(isAuthorized("", ""), false);
});

Deno.test("mapPlaceDetails: extrai nota, contagem e atribuicao", () => {
  const out = mapPlaceDetails({
    rating: 4.6,
    userRatingCount: 312,
    googleMapsUri: "https://maps.google.com/?cid=1",
    reviews: [
      {
        rating: 5,
        text: { text: "Atendimento rapido." },
        originalText: { text: "Atendimento rapido." },
        publishTime: "2026-07-02T10:00:00Z",
        relativePublishTimeDescription: "há um mês",
        googleMapsUri: "https://maps.google.com/review/1",
        authorAttribution: {
          displayName: "Ana P.",
          photoUri: "https://lh3.googleusercontent.com/a/1",
          uri: "https://www.google.com/maps/contrib/1",
        },
      },
    ],
  });
  assertEquals(out.rating, 4.6);
  assertEquals(out.user_rating_count, 312);
  assertEquals(out.maps_uri, "https://maps.google.com/?cid=1");
  assertEquals(out.reviews.length, 1);
  assertEquals(out.reviews[0].authorName, "Ana P.");
  assertEquals(out.reviews[0].authorUri, "https://www.google.com/maps/contrib/1");
  assertEquals(out.reviews[0].text, "Atendimento rapido.");
});

Deno.test("mapPlaceDetails: guarda o originalText, nunca a traducao de maquina", () => {
  // A chamada manda languageCode=pt-BR, entao o Places devolve `text` traduzido quando a
  // avaliacao foi escrita em outra lingua. Guardar essa versao e publica-la como palavra do
  // autor quebra a regra de atribuicao (§11 da spec: sem editar, cortar ou traduzir).
  const out = mapPlaceDetails({
    rating: 4.8,
    userRatingCount: 40,
    reviews: [
      {
        rating: 5,
        text: { text: "Servico rapido e equipe atenciosa." },
        originalText: { text: "Fast service and a helpful team." },
        publishTime: "2026-07-02T10:00:00Z",
        authorAttribution: { displayName: "John D." },
      },
    ],
  });
  assertEquals(out.reviews[0].text, "Fast service and a helpful team.");
});

Deno.test("mapPlaceDetails: sem originalText cai no text, porque e ele ou nada", () => {
  const out = mapPlaceDetails({
    rating: 4.8,
    userRatingCount: 40,
    reviews: [
      {
        rating: 5,
        text: { text: "Estacionamento limpo." },
        publishTime: "2026-07-02T10:00:00Z",
        authorAttribution: { displayName: "Bia M." },
      },
    ],
  });
  assertEquals(out.reviews[0].text, "Estacionamento limpo.");
});

Deno.test("mapPlaceDetails: lugar sem avaliacao nao quebra", () => {
  const out = mapPlaceDetails({ rating: null, userRatingCount: 0 });
  assertEquals(out.rating, null);
  assertEquals(out.user_rating_count, 0);
  assertEquals(out.reviews, []);
  assertEquals(out.maps_uri, null);
});

Deno.test("mapPlaceDetails: review sem autor e descartada, porque atribuicao e obrigatoria", () => {
  const out = mapPlaceDetails({
    rating: 4.0,
    userRatingCount: 2,
    reviews: [{ rating: 5, text: { text: "boa" }, publishTime: "2026-07-02T10:00:00Z" }],
  });
  assertEquals(out.reviews, []);
});

// --- resolução de place_id por Text Search ---------------------------------

const VCP = { lat: -23.0074, lng: -47.1345 };
const base = (over: Partial<PlaceCandidate> = {}): PlaceCandidate => ({
  id: "place-a",
  displayName: "Bandeira Park - Estacionamento Aeroporto Viracopos Campinas VCP",
  formattedAddress: "R. Antônio Luchiari, 1100 - Distrito Industrial, Campinas - SP",
  businessStatus: "OPERATIONAL",
  primaryType: "parking_lot",
  latitude: -22.991637,
  longitude: -47.1119593,
  ...over,
});
const alvoBandeira = { name: "Bandeira Park", latitude: -22.991637, longitude: -47.1119593 };

Deno.test("normalizeName: tira acento, caixa e pontuacao", () => {
  assertEquals(normalizeName("Pórtico  Estacionamento!"), "portico estacionamento");
});

Deno.test("nameSimilarity: nome identico da 1", () => {
  assertEquals(nameSimilarity("Bandeira Park", "bandeira park"), 1);
});

Deno.test("nameSimilarity: o nome longo do Google contem o nosso e passa o limite forte", () => {
  const s = nameSimilarity("Bandeira Park", base().displayName);
  assertEquals(s >= 0.85, true);
});

Deno.test("nameSimilarity: marcas diferentes que so dividem 'park' nao pontuam", () => {
  // Foi assim que os leads de Brasilia entraram errado na rodada manual.
  assertEquals(nameSimilarity("Aero Park", "DF Park"), 0);
});

Deno.test("nameSimilarity: Multipark e Bandeira Park nao se confundem", () => {
  assertEquals(nameSimilarity("Multipark", "Bandeira Park") < 0.6, true);
});

Deno.test("haversineKm: mesma coordenada da zero", () => {
  assertEquals(Math.round(haversineKm(VCP.lat, VCP.lng, VCP.lat, VCP.lng)), 0);
});

Deno.test("pickPlaceMatch: aceita o match obvio", () => {
  assertEquals(pickPlaceMatch(alvoBandeira, [base()])?.id, "place-a");
});

Deno.test("pickPlaceMatch: recusa lugar fechado", () => {
  const fechado = base({ businessStatus: "CLOSED_TEMPORARILY" });
  assertEquals(pickPlaceMatch(alvoBandeira, [fechado]), null);
});

Deno.test("pickPlaceMatch: aceita park_and_ride, que o regex antigo reprovava", () => {
  const pnr = base({ primaryType: "park_and_ride" });
  assertEquals(pickPlaceMatch(alvoBandeira, [pnr])?.id, "place-a");
});

Deno.test("pickPlaceMatch: recusa tipo que nao e estacionamento", () => {
  // Market Park (VIX) resolveu para um hotel na rodada manual.
  const hotel = base({ primaryType: "lodging", displayName: "Quality Hotel Aeroporto" });
  assertEquals(pickPlaceMatch(alvoBandeira, [hotel]), null);
});

Deno.test("pickPlaceMatch: nome forte tolera 15 km, porque o pino errado costuma ser o nosso", () => {
  const longe = base({ latitude: -22.94, longitude: -47.06 });
  const km = haversineKm(alvoBandeira.latitude, alvoBandeira.longitude, -22.94, -47.06);
  assertEquals(km > 3 && km <= 15, true);
  assertEquals(pickPlaceMatch(alvoBandeira, [longe])?.id, "place-a");
});

Deno.test("pickPlaceMatch: place_id ja preso a outra ficha e recusado (guarda do D-009)", () => {
  assertEquals(pickPlaceMatch(alvoBandeira, [base()], new Set(["place-a"])), null);
});

Deno.test("pickPlaceMatch: empate entre dois aprovados reprova em vez de chutar", () => {
  const a = base({ id: "a" });
  const b = base({ id: "b" });
  assertEquals(pickPlaceMatch(alvoBandeira, [a, b]), null);
});

Deno.test("pickPlaceMatch: sem candidato devolve null", () => {
  assertEquals(pickPlaceMatch(alvoBandeira, []), null);
});

Deno.test("pickPlaceMatch: candidato sem coordenada e descartado", () => {
  const semGeo = base({ latitude: null, longitude: null });
  assertEquals(pickPlaceMatch(alvoBandeira, [semGeo]), null);
});

Deno.test("RETRY_LOOKUP_AFTER_DAYS: a janela de nova tentativa e de 30 dias", () => {
  assertEquals(RETRY_LOOKUP_AFTER_DAYS, 30);
});

Deno.test("nameSimilarity: marca da empresa e o que distingue a unidade parceira", () => {
  // A unidade se chama "Aeroporto de Congonhas" no catálogo. Sozinho, o nome deixa só
  // "congonhas", que casa com qualquer pátio da praça. Com a marca junto, o certo passa
  // e o concorrente vizinho não.
  const certo = "Plenty Park - Estacionamento Aeroporto Congonhas";
  const vizinho = "Estapar Estacionamento Aeroporto Congonhas";

  assertEquals(nameSimilarity("Aeroporto de Congonhas", vizinho) >= 0.85, true);

  assertEquals(nameSimilarity("Plenty Park Aeroporto de Congonhas", certo) >= 0.85, true);
  assertEquals(nameSimilarity("Plenty Park Aeroporto de Congonhas", vizinho) < 0.6, true);
});
