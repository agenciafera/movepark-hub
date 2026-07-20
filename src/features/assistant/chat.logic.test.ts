import { describe, expect, it } from "vitest";
import {
  appendMessage,
  canSend,
  parseChatMarkdown,
  parseInline,
  toRequestMessages,
  type ChatMessage,
} from "./chat.logic";

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

describe("parseInline (negrito)", () => {
  it("separa **negrito** do texto normal", () => {
    expect(parseInline("Valor: **R$ 36,00** total")).toEqual([
      { bold: false, text: "Valor: " },
      { bold: true, text: "R$ 36,00" },
      { bold: false, text: " total" },
    ]);
  });
  it("texto sem negrito vira um span só", () => {
    expect(parseInline("só texto")).toEqual([{ bold: false, text: "só texto" }]);
  });
});

describe("parseChatMarkdown (blocos)", () => {
  it("lista com * vira ul; sem asterisco cru", () => {
    const md = "Para confirmar:\n* **Estacionamento:** Virapark\n* **Valor:** R$ 36,00";
    const blocks = parseChatMarkdown(md);
    expect(blocks[0]).toEqual({ type: "p", spans: [{ bold: false, text: "Para confirmar:" }] });
    expect(blocks[1].type).toBe("ul");
    if (blocks[1].type === "ul") {
      expect(blocks[1].items.length).toBe(2);
      // o primeiro item tem um trecho em negrito ("Estacionamento:")
      expect(blocks[1].items[0].some((s) => s.bold)).toBe(true);
    }
  });
  it("linha em branco separa parágrafos", () => {
    const blocks = parseChatMarkdown("Oi.\n\nTudo certo?");
    expect(blocks.map((b) => b.type)).toEqual(["p", "p"]);
  });
  it("aceita - como marcador de lista", () => {
    const blocks = parseChatMarkdown("- um\n- dois");
    expect(blocks[0].type).toBe("ul");
  });
});
