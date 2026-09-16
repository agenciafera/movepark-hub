import { describe, expect, it } from "vitest";
import { falha, rpc } from "@/test/msw/supabase";
import { recordLoginChannel } from "./loginChannel";

describe("recordLoginChannel", () => {
  it("grava o canal pela RPC keyed em auth.uid()", async () => {
    const chamada = rpc("record_login_channel", { json: null });
    await recordLoginChannel("whatsapp");
    expect(chamada.ultimoBody).toEqual({ p_channel: "whatsapp" });
  });

  it("falha do servidor não derruba o login", async () => {
    falha("rpc", "record_login_channel", 500, "boom");
    await expect(recordLoginChannel("google")).resolves.toBeUndefined();
  });
});
