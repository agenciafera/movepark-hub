import { assertEquals } from "jsr:@std/assert";
import { parseChangeVehicleInput } from "./logic.ts";

Deno.test("parseChangeVehicleInput: exige booking_code e vehicle_id", () => {
  assertEquals(parseChangeVehicleInput({}).error, "booking_code é obrigatório.");
  assertEquals(parseChangeVehicleInput({ booking_code: "MP-1" }).error, "vehicle_id é obrigatório.");
});

Deno.test("parseChangeVehicleInput: normaliza e aceita", () => {
  assertEquals(parseChangeVehicleInput({ booking_code: " MP-2 ", vehicle_id: " v1 " }).input, {
    bookingCode: "MP-2",
    vehicleId: "v1",
  });
});
