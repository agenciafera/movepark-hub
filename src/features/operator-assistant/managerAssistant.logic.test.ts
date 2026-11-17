import { describe, expect, it } from "vitest";
import { agruparConversas, erroDoArtigo, type FalaGravada, slugDoTitulo } from "./managerAssistant.logic";

const fala = (over: Partial<FalaGravada>): FalaGravada => ({
  id: Math.random().toString(),
  conversation_id: "c1",
  role: "user",
  content: "oi",
  used_tools: [],
  error: null,
  booking_code: null,
  created_at: "2026-11-17T10:00:00Z",
  company: { name: "Virapark" },
  profile: { full_name: "Ana" },
  ...over,
});

describe("Manager › Mia para operadores", () => {
  it("agrupa por conversa, em ordem de leitura, e a mais recente primeiro", () => {
    const conversas = agruparConversas([
      fala({ conversation_id: "c2", created_at: "2026-11-17T12:00:00Z", content: "nova" }),
      fala({ conversation_id: "c1", role: "assistant", created_at: "2026-11-17T10:01:00Z", content: "resposta" }),
      fala({ conversation_id: "c1", created_at: "2026-11-17T10:00:00Z", content: "pergunta" }),
      fala({ conversation_id: "c1", role: "system", content: "Nova conversa", created_at: "2026-11-17T09:00:00Z" }),
    ]);
    expect(conversas.map((c) => c.id)).toEqual(["c2", "c1"]);
    expect(conversas[1].falas.map((f) => f.content)).toEqual(["pergunta", "resposta"]);
    expect(conversas[1].perguntas).toBe(1);
  });

  it("marca conversa com erro do agente", () => {
    const [c] = agruparConversas([fala({ role: "assistant", content: "", error: "beast-bots 502" })]);
    expect(c.comErro).toBe(true);
  });

  it("slug sem acento nem símbolo", () => {
    expect(slugDoTitulo("Cliente quer cancelar fora do prazo?")).toBe("cliente-quer-cancelar-fora-do-prazo");
    expect(slugDoTitulo("Proteção de voo (Superflex)")).toBe("protecao-de-voo-superflex");
  });

  it("artigo exige título, categoria e texto, e recusa travessão", () => {
    const ok = { title: "Quando cai o estorno", category: "Estorno", body_md: "O estorno volta na mesma forma de pagamento da reserva." };
    expect(erroDoArtigo(ok)).toBeNull();
    expect(erroDoArtigo({ ...ok, title: "" })).toContain("título");
    expect(erroDoArtigo({ ...ok, body_md: "curto" })).toContain("curto");
    expect(erroDoArtigo({ ...ok, body_md: ok.body_md + " \u2014 e mais" })).toContain("travessão");
  });
});
