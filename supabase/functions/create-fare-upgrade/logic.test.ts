import { assertEquals } from "jsr:@std/assert";
import { parseBrPhone, parseUpgradeInput, reaisToCents } from "./logic.ts";

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
