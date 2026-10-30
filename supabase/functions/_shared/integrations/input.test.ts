import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { bookingRowToReserveInput, SENDABLE } from "./input.ts";

const row = {
  code: "MP-855347",
  status: "confirmed",
  check_in_at: "2026-11-04T07:30:00+00:00",
  check_out_at: "2026-11-11T02:00:00+00:00",
  total_amount: "181.30",
  passenger_count: 3,
  has_pcd: true,
  customer_first_name: "Bruno",
  customer_last_name: "Lima",
  customer_name: "Bruno Lima",
  customer_email: " bruno@example.com ",
  customer_phone: "41988887777",
  customer_tax_id: "11122233344",
  vehicle: { license_plate: "BEU6D59", model: "HB20", color: null },
  items: [
    { item_type: "add_on", parking_type_id: null, parking_type: null },
    { item_type: "parking", parking_type_id: "pt-1", parking_type: { name: "Vaga Coberta" } },
  ],
};

Deno.test("bookingRowToReserveInput: snapshot do pedido e o tipo de vaga do item de estacionamento", () => {
  const i = bookingRowToReserveInput(row);
  assertEquals(i.bookingCode, "MP-855347");
  assertEquals(i.firstName, "Bruno");
  assertEquals(i.lastName, "Lima");
  assertEquals(i.email, "bruno@example.com");
  assertEquals(i.totalAmount, 181.3);
  assertEquals(i.plate, "BEU6D59");
  assertEquals(i.vehicleColor, null);
  assertEquals(i.parkingTypeId, "pt-1");
  assertEquals(i.parkingTypeName, "Vaga Coberta");
  assertEquals(i.hasPcd, true);
});

Deno.test("bookingRowToReserveInput: sem nome separado, divide o nome completo", () => {
  const i = bookingRowToReserveInput({
    ...row,
    customer_first_name: null,
    customer_last_name: null,
    customer_name: "Maria da Silva Souza",
  });
  assertEquals(i.firstName, "Maria");
  assertEquals(i.lastName, "da Silva Souza");
});

Deno.test("bookingRowToReserveInput: sem veículo nem item, não quebra", () => {
  const i = bookingRowToReserveInput({ ...row, vehicle: null, items: [] });
  assertEquals(i.plate, null);
  assertEquals(i.parkingTypeId, null);
});

Deno.test("SENDABLE: só reserva confirmada ou com o carro dentro vai para a cancela", () => {
  assertEquals([...SENDABLE].sort(), ["checked_in", "confirmed"]);
});
