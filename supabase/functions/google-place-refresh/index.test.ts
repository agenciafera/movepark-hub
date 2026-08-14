import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { mapPlaceDetails, REFRESH_AFTER_DAYS, selectStale } from "./logic.ts";

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

Deno.test("mapPlaceDetails: extrai nota, contagem e atribuicao", () => {
  const out = mapPlaceDetails({
    rating: 4.6,
    userRatingCount: 312,
    googleMapsUri: "https://maps.google.com/?cid=1",
    reviews: [
      {
        rating: 5,
        text: { text: "Atendimento rapido." },
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
