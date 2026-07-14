import { assertEquals } from "jsr:@std/assert";
import { parseChangeVehicleInput, plateChangeAllowed } from "./logic.ts";

// Gate por tier (espelha o seed `fare`): Básica não tem plate_change; Flex/Superflex têm; staff override.
const BENEFITS = {
  basica: { date_change: false, plate_change: false },
  flex: { date_change: true, plate_change: true },
  superflex: { date_change: true, plate_change: true },
};

Deno.test("plateChangeAllowed: Básica bloqueia; Flex/Superflex liberam (cliente)", () => {
  assertEquals(plateChangeAllowed(BENEFITS.basica, false), false);
  assertEquals(plateChangeAllowed(BENEFITS.flex, false), true);
  assertEquals(plateChangeAllowed(BENEFITS.superflex, false), true);
});

Deno.test("plateChangeAllowed: staff faz override mesmo na Básica", () => {
  assertEquals(plateChangeAllowed(BENEFITS.basica, true), true);
});

Deno.test("plateChangeAllowed: benefits ausente/nulo → bloqueia cliente", () => {
  assertEquals(plateChangeAllowed(null, false), false);
  assertEquals(plateChangeAllowed({}, false), false);
});

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
