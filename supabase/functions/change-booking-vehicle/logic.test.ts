import { assertEquals } from "jsr:@std/assert";
import { parseChangeVehicleInput } from "./logic.ts";

Deno.test("parseChangeVehicleInput: exige booking_code e (vehicle_id ou license_plate)", () => {
  assertEquals(parseChangeVehicleInput({}).error, "booking_code é obrigatório.");
  assertEquals(parseChangeVehicleInput({ booking_code: "MP-1" }).error, "Informe vehicle_id ou license_plate.");
});

Deno.test("parseChangeVehicleInput: por vehicle_id", () => {
  assertEquals(parseChangeVehicleInput({ booking_code: " MP-2 ", vehicle_id: " v1 " }).input, {
    bookingCode: "MP-2",
    vehicleId: "v1",
    licensePlate: null,
  });
});

Deno.test("parseChangeVehicleInput: por placa (normaliza maiúscula/sem espaço)", () => {
  assertEquals(parseChangeVehicleInput({ booking_code: "MP-3", license_plate: " bra 2e19 " }).input, {
    bookingCode: "MP-3",
    vehicleId: null,
    licensePlate: "BRA2E19",
  });
});
