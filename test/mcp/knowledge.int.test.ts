import { describe, expect, it } from "vitest";
import { rpc, toolPayload } from "../support/mcp";

// Contrato da busca semântica (E3.3, RAG nativo com pgvector) contra o ambiente vivo.
// Ver docs/specs/knowledge-base.md.
//
// Regra de ouro destas asserções: nada depende da prosa de um modelo. O que se afirma é o
// MECANISMO (escopo, teto de k, relevância do trecho recuperado). Asserir texto gerado por LLM
// produz teste que pisca; asserir o trecho recuperado do banco é determinístico.

interface Chunk {
  source_type: string;
  source_id: string;
  content: string;
  scope: string;
  location_id: string | null;
  destination_id: string | null;
  similarity: number;
}

async function search(args: Record<string, unknown>) {
  const r = await rpc("", "tools/call", { name: "search_knowledge", arguments: args });
  return toolPayload<{ chunks: Chunk[]; count: number }>(r);
}

describe("search_knowledge · recuperação semântica", () => {
  it("acha a resposta certa mesmo com palavras diferentes das do conteúdo", async () => {
    // A FAQ diz "Posso chegar antes ou sair depois do horário?"; a pergunta não repete nenhuma
    // dessas palavras-chave. É isso que separa busca vetorial de busca por palavra.
    const out = await search({ query: "tem tolerância se eu me atrasar na saída?", k: 5 });
    expect(out.count).toBeGreaterThan(0);
    const top = out.chunks[0];
    expect(top.similarity).toBeGreaterThan(0.5);
    expect(
      out.chunks.some((c) => /toler(â|a)ncia|30 min/i.test(c.content)),
      `nenhum trecho sobre tolerância no top-${out.chunks.length}: ${out.chunks.map((c) => c.content.slice(0, 40))}`,
    ).toBe(true);
  });

  it("ordena por similaridade decrescente", async () => {
    const out = await search({ query: "como faço para cancelar uma reserva?", k: 5 });
    const sims = out.chunks.map((c) => c.similarity);
    expect(sims).toEqual([...sims].sort((a, b) => b - a));
  });

  it("devolve trecho com a fonte (para o agente citar de onde veio)", async () => {
    const out = await search({ query: "quais formas de pagamento?", k: 3 });
    for (const c of out.chunks) {
      expect(c.source_type).toBeTruthy();
      expect(c.source_id).toBeTruthy();
      expect(c.content.length).toBeGreaterThan(0);
    }
  });
});

// A barreira anti-vazamento do RAG multi-tenant: a RPC match_knowledge é security definer e filtra
// por escopo (ADR-002). Sem unidade, o anônimo só pode ver conhecimento global. Se alguém quebrar
// esse filtro, conteúdo de um lote aparece na conversa de outro.
describe("search_knowledge · isolamento de escopo", () => {
  it("sem location/destination, devolve apenas escopo global", async () => {
    const out = await search({ query: "estacionamento", k: 20 });
    expect(out.count).toBeGreaterThan(0);
    for (const c of out.chunks) {
      expect(c.scope, `escopo ${c.scope} vazou sem location: ${c.content.slice(0, 50)}`).toBe(
        "global",
      );
      expect(c.location_id).toBeNull();
    }
  });

  it("respeita o teto de k do servidor (não confia no cliente)", async () => {
    const out = await search({ query: "reserva", k: 500 });
    expect(out.chunks.length).toBeLessThanOrEqual(20);
    expect(out.chunks.length).toBe(out.count);
  });

  // Controle positivo do teste acima. Sem isto, "só devolve global" passaria mesmo que o filtro
  // estivesse quebrado e simplesmente não existisse conteúdo de outro escopo no banco. Aqui provamos
  // que escopo `destination` É alcançável quando pedido, então a ausência dele no anônimo tem valor.
  it("com destination_id, o conhecimento daquele destino aparece (o filtro seleciona, não some)", async () => {
    const dr = await rpc("", "tools/call", {
      name: "list_destinations",
      arguments: { limit: 20 },
    });
    const dests = toolPayload<Array<{ id: string; slug: string }>>(dr);
    expect(dests.length).toBeGreaterThan(0);

    let achou: Chunk | undefined;
    for (const d of dests.slice(0, 8)) {
      const out = await search({ query: "traslado e horários do aeroporto", destination_id: d.id, k: 10 });
      achou = out.chunks.find((c) => c.scope === "destination" && c.destination_id === d.id);
      if (achou) break;
    }
    expect(
      achou,
      "nenhum destino devolveu conhecimento de escopo destination; o teste de isolamento fica sem controle positivo",
    ).toBeTruthy();
  });
});
