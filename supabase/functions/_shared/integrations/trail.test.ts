import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { redactForTrail } from "./trail.ts";

Deno.test("redactForTrail: mascara contato e documento, mantém o que serve para conferir", () => {
  const out = redactForTrail({
    initial_date: "2026-10-31 06:00:00",
    license_plate: "BBR4H93",
    name: "Ana",
    email: "ana.souza@example.com",
    phone: "41999990000",
    document: "12345678900",
    vehicle: { license_plate: "BBR4H93", model: "Onix" },
  });
  assertEquals(out.initial_date, "2026-10-31 06:00:00");
  assertEquals(out.license_plate, "BBR4H93");
  assertEquals(out.name, "Ana");
  assertEquals(out.email, "a***@example.com");
  assertEquals(out.phone, "***0000");
  assertEquals(out.document, "***00");
  assertEquals(out.vehicle, { license_plate: "BBR4H93", model: "Onix" });
});

Deno.test("redactForTrail: campos vazios ficam vazios", () => {
  assertEquals(redactForTrail({ email: null, phone: "", document: undefined }), {
    email: null,
    phone: "",
    document: undefined,
  });
});
