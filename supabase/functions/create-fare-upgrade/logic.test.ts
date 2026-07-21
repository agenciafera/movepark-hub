import { assertEquals } from "jsr:@std/assert";
import {
  checkBookingUpgradable,
  checkUpgradeDelta,
  parseBrPhone,
  parseUpgradeInput,
  reaisToCents,
} from "./logic.ts";

Deno.test("parseUpgradeInput: exige booking_code e target_tier válido", () => {
  assertEquals(parseUpgradeInput({}).error, "booking_code é obrigatório.");
  assertEquals(parseUpgradeInput({ booking_code: "MP-1" }).error, "target_tier inválido.");
  assertEquals(parseUpgradeInput({ booking_code: "MP-1", target_tier: "ouro" }).error, "target_tier inválido.");
});

Deno.test("parseUpgradeInput: aceita níveis válidos e normaliza", () => {
  assertEquals(parseUpgradeInput({ booking_code: " MP-2 ", target_tier: "superflex" }).input, {
    bookingCode: "MP-2",
    targetTier: "superflex",
  });
});

Deno.test("reaisToCents / parseBrPhone", () => {
  assertEquals(reaisToCents(12.9), 1290);
  assertEquals(parseBrPhone("(19) 98801-3420"), { ddd: "19", number: "988013420" });
  assertEquals(parseBrPhone("123"), null);
});

// ── C-17 · Upgrade: downgrade e prazo bloqueados ────────────────────────────
// Roteiro: docs/testes/roteiro-consumidor-reserva.md (C-17).
// Preços do catálogo (20260717000000_fare_tiers.sql): basica 0, flex 1290, superflex 2490.

const NOW = new Date("2026-07-21T12:00:00Z");
const OWNER = "11111111-1111-1111-1111-111111111111";
const OUTRO = "22222222-2222-2222-2222-222222222222";
const inHours = (h: number) => new Date(NOW.getTime() + h * 3_600_000).toISOString();

const bookingBase = {
  status: "confirmed",
  check_in_at: inHours(48),
  fare_tier: "basica",
  profile_id: OWNER,
};

Deno.test("C-17: reserva confirmada, do dono, com check-in no futuro passa nos gates", () => {
  assertEquals(
    checkBookingUpgradable({
      booking: bookingBase,
      userId: OWNER,
      targetTier: "superflex",
      now: NOW,
    }),
    null,
  );
});

Deno.test("C-17: dono diferente devolve 403", () => {
  assertEquals(
    checkBookingUpgradable({
      booking: bookingBase,
      userId: OUTRO,
      targetTier: "superflex",
      now: NOW,
    }),
    { status: 403, error: "Reserva não pertence a você" },
  );
});

Deno.test("C-17: check-in já passado devolve 400", () => {
  for (const checkIn of [inHours(-1), inHours(-48)]) {
    assertEquals(
      checkBookingUpgradable({
        booking: { ...bookingBase, check_in_at: checkIn },
        userId: OWNER,
        targetTier: "superflex",
        now: NOW,
      }),
      { status: 400, error: "Upgrade só antes da entrada." },
    );
  }
  // Fronteira exata: check-in agora já está fora do prazo.
  assertEquals(
    checkBookingUpgradable({
      booking: { ...bookingBase, check_in_at: NOW.toISOString() },
      userId: OWNER,
      targetTier: "superflex",
      now: NOW,
    }),
    { status: 400, error: "Upgrade só antes da entrada." },
  );
});

Deno.test("C-17: status fora de pending/confirmed devolve 400", () => {
  for (const status of ["cancelled", "checked_in", "completed", "no_show", "expired"]) {
    assertEquals(
      checkBookingUpgradable({
        booking: { ...bookingBase, status },
        userId: OWNER,
        targetTier: "superflex",
        now: NOW,
      }),
      { status: 400, error: "Esta reserva não permite upgrade." },
      `${status} não deveria aceitar upgrade`,
    );
  }
});

Deno.test("C-17: reserva pending aceita upgrade (comportamento intencional do código)", () => {
  // Dá para comprar upgrade de uma reserva ainda não paga. Está assim de propósito na Edge, e o
  // roteiro registra que merece confirmação de produto. O teste trava o que existe hoje: se o
  // produto decidir bloquear, este é o teste que precisa mudar junto.
  assertEquals(
    checkBookingUpgradable({
      booking: { ...bookingBase, status: "pending" },
      userId: OWNER,
      targetTier: "superflex",
      now: NOW,
    }),
    null,
  );
});

Deno.test("C-17: mesma Tarifa devolve 400", () => {
  assertEquals(
    checkBookingUpgradable({
      booking: { ...bookingBase, fare_tier: "superflex" },
      userId: OWNER,
      targetTier: "superflex",
      now: NOW,
    }),
    { status: 400, error: "A reserva já está nessa Tarifa." },
  );
});

Deno.test("C-17: downgrade devolve 400 (delta <= 0)", () => {
  // Superflex (2490) para Flex (1290): delta negativo.
  assertEquals(
    checkUpgradeDelta({ targetPriceCents: 1290, currentFarePriceCents: 2490 }),
    { status: 400, error: "Sem upgrade (Tarifa-alvo não é superior)." },
  );
  // Delta zero também é recusado.
  assertEquals(
    checkUpgradeDelta({ targetPriceCents: 1290, currentFarePriceCents: 1290 }),
    { status: 400, error: "Sem upgrade (Tarifa-alvo não é superior)." },
  );
});

Deno.test("C-17: upgrade real passa e Tarifa-alvo ausente devolve 404", () => {
  // Básica (0) para Superflex (2490): pular a Flex é permitido.
  assertEquals(checkUpgradeDelta({ targetPriceCents: 2490, currentFarePriceCents: 0 }), null);
  assertEquals(checkUpgradeDelta({ targetPriceCents: 2490, currentFarePriceCents: null }), null);
  assertEquals(checkUpgradeDelta({ targetPriceCents: null, currentFarePriceCents: 0 }), {
    status: 404,
    error: "Tarifa-alvo indisponível.",
  });
});
