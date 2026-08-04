import { describe, expect, it } from "vitest";
import { falha, renderMutation, tabela } from "@/test/msw/supabase";
import {
  useCreateDestination,
  useCreateDestinationPoint,
  useDeleteDestination,
  useDeleteDestinationPoint,
  useUpdateDestination,
  useUpdateDestinationPoint,
} from "./api";

/**
 * Contrato de rede dos destinos. O destino é a porta de entrada da busca e a página
 * `/destinos/<slug>` é SSG, então o slug entra em url indexada. Trocar um slug depois
 * de publicado não é edição de cadastro, é link quebrado no Google.
 *
 * Os pontos de destino alimentam a proximidade calculada no banco (ADR-001): a
 * coordenada gravada aqui é a que decide qual estacionamento aparece como mais perto.
 */

describe("useCreateDestination", () => {
  it("insere o destino e devolve a linha criada", async () => {
    // O retorno importa: a tela encadeia o cadastro dos pontos com o id que volta.
    tabela("destination", "post", { json: { id: "dest-1", slug: "aeroporto-qa" } });

    const { result } = renderMutation(() => useCreateDestination());
    const criado = await result.current.mutateAsync({
      name: "Aeroporto QA",
      slug: "aeroporto-qa",
      code: "QAX",
      type: "airport",
      city: "Campinas",
      state: "SP",
      latitude: -22.9,
      longitude: -47.06,
    });

    expect((criado as { id: string }).id).toBe("dest-1");
  });

  it("slug duplicado sobe com a mensagem do servidor", async () => {
    // O slug é único porque vira url. A tela precisa dizer isso, não "erro ao salvar".
    falha("tabela", "destination", 409, "slug já existe");

    const { result } = renderMutation(() => useCreateDestination());
    await expect(
      result.current.mutateAsync({
        name: "X",
        slug: "aeroporto-qa",
        code: "QAX",
        type: "airport",
        city: "C",
        state: "SP",
        latitude: -22.9,
        longitude: -47.06,
      }),
    ).rejects.toThrow();
  });
});

describe("useUpdateDestination", () => {
  it("aplica o patch no destino certo, e só o que mudou", async () => {
    const patch = tabela("destination", "patch", { json: { id: "dest-9" } });

    const { result } = renderMutation(() => useUpdateDestination());
    await result.current.mutateAsync({ id: "dest-9", patch: { name: "Aeroporto Novo" } });

    expect(patch.chamadas[0].url).toContain("id=eq.dest-9");
    expect(patch.ultimoBody).toEqual({ name: "Aeroporto Novo" });
  });
});

describe("useDeleteDestination", () => {
  it("apaga pelo id", async () => {
    // Delete duro aqui é do schema: `destination` não tem deleted_at. Quem segura o
    // estrago é a FK de `location.destination_id`, que recusa apagar destino em uso.
    const del = tabela("destination", "delete", { json: [] });

    const { result } = renderMutation(() => useDeleteDestination());
    await result.current.mutateAsync("dest-9");

    expect(del.chamadas[0].url).toContain("id=eq.dest-9");
  });

  it("destino em uso: a recusa da FK chega na tela", async () => {
    falha("tabela", "destination", 409, "violates foreign key constraint");

    const { result } = renderMutation(() => useDeleteDestination());
    await expect(result.current.mutateAsync("dest-9")).rejects.toThrow();
  });
});

describe("useCreateDestinationPoint", () => {
  it("insere o ponto com as coordenadas recebidas", async () => {
    // Latitude e longitude aqui viram a `geography(Point)` que o PostGIS usa para
    // ordenar por distância (ADR-001). Inverter os dois põe o aeroporto no oceano, e
    // a busca passa a devolver a ordem errada sem nenhum erro.
    const ins = tabela("destination_point", "post", { json: { id: "pt-1" } });

    const { result } = renderMutation(() => useCreateDestinationPoint());
    await result.current.mutateAsync({
      destination_id: "dest-1",
      name: "Terminal 1",
      latitude: -22.9,
      longitude: -47.06,
    });

    expect(ins.ultimoBody).toMatchObject({
      destination_id: "dest-1",
      latitude: -22.9,
      longitude: -47.06,
    });
  });
});

describe("useUpdateDestinationPoint", () => {
  it("aplica o patch no ponto certo", async () => {
    const patch = tabela("destination_point", "patch", { json: { id: "pt-9" } });

    const { result } = renderMutation(() => useUpdateDestinationPoint());
    await result.current.mutateAsync({ id: "pt-9", patch: { latitude: -23.1 } });

    expect(patch.chamadas[0].url).toContain("id=eq.pt-9");
    expect(patch.ultimoBody).toEqual({ latitude: -23.1 });
  });
});

describe("useDeleteDestinationPoint", () => {
  it("apaga o ponto pelo id, na tabela de pontos", async () => {
    // O hook recebe { id, destinationId }: o segundo é só para invalidar a lista do
    // destino. Passar uma string solta aqui monta `id=eq.undefined`, que o PostgREST
    // aceita calado e devolve 200 sem apagar nada. Foi o que aconteceu ao escrever
    // este teste, e é por isso que a asserção olha a url e não só o status.
    const del = tabela("destination_point", "delete", { json: [] });

    const { result } = renderMutation(() => useDeleteDestinationPoint());
    await result.current.mutateAsync({ id: "pt-9", destinationId: "dest-1" });

    expect(del.chamadas[0].url).toContain("/destination_point");
    expect(del.chamadas[0].url).toContain("id=eq.pt-9");
    expect(del.chamadas[0].url).not.toContain("undefined");
  });
});
