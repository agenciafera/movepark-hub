import { describe, expect, it } from "vitest";
import { appendMessage, canSend, toRequestMessages, type ChatMessage } from "./chat.logic";

describe("chat.logic", () => {
  it("toRequestMessages descarta vazias e mantém role+text", () => {
    const msgs: ChatMessage[] = [
      { id: "1", role: "user", text: "oi" },
      { id: "2", role: "model", text: "   " },
      { id: "3", role: "model", text: "olá" },
    ];
    expect(toRequestMessages(msgs)).toEqual([
      { role: "user", text: "oi" },
      { role: "model", text: "olá" },
    ]);
  });

  it("appendMessage adiciona com id único e role", () => {
    const a = appendMessage([], "user", "quanto custa?");
    expect(a).toHaveLength(1);
    expect(a[0].role).toBe("user");
    const b = appendMessage(a, "model", "depende");
    expect(b).toHaveLength(2);
    expect(b[1].role).toBe("model");
    expect(b[0].id).not.toBe(b[1].id);
  });

  it("canSend exige texto e não-pendente", () => {
    expect(canSend("oi", false)).toBe(true);
    expect(canSend("  ", false)).toBe(false);
    expect(canSend("oi", true)).toBe(false);
  });
});
