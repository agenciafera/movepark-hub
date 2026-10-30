import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { parseTestRequest } from "./logic.ts";

Deno.test("parseTestRequest: aceita só um uuid de conexão", () => {
  assertEquals(parseTestRequest({ connection_id: "6A06F828-E756-4536-B40F-FD1D3D087FB1" }), {
    connectionId: "6a06f828-e756-4536-b40f-fd1d3d087fb1",
  });
  assertEquals(parseTestRequest({ connection_id: "1; drop table" }), { error: "connection_id inválido" });
  assertEquals(parseTestRequest({}), { error: "connection_id inválido" });
  assertEquals(parseTestRequest(null), { error: "connection_id inválido" });
});
