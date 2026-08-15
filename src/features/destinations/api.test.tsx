import { describe, expect, it } from "vitest";
import { falha, renderMutation, rpc, tabela } from "@/test/msw/supabase";
import {
  fetchDestinationProspects,
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

describe("fetchDestinationProspects", () => {
  it("converte a nota do Google, que o PostgREST devolve como string", async () => {
    // `numeric` chega "4.4" no JSON. Sem o Number() o formatRating recebe string e o selo
    // sai errado, do mesmo jeito que já acontecia com a distância.
    rpc("destination_prospect_cards", {
      json: [
        {
          id: "p1",
          name: "Talentos Park",
          slug: "talentos-park",
          address: "R. Projetada, 169",
          latitude: "-8.13",
          longitude: "-34.91",
          google_maps_url: "https://www.google.com/maps/place/?q=place_id:ChIJ_x",
          amenities: [],
          description: null,
          distance_km: "1.01",
          reference_name: null,
          google_place_id: "ChIJ_x",
          google_rating: "4.4",
          google_rating_count: 137,
          google_fetched_at: "2026-08-11T03:00:00Z",
        },
      ],
    });

    const [card] = await fetchDestinationProspects("aeroporto-de-congonhas");

    expect(card.google_rating).toBe(4.4);
    expect(card.google_rating_count).toBe(137);
    expect(card.distance_km).toBe(1.01);
    // A data da coleta atravessa até o card: é ela que deixa o componente recusar nota
    // vencida num HTML que foi construído há mais de 30 dias e continua servido na borda.
    expect(card.google_fetched_at).toBe("2026-08-11T03:00:00Z");
    // O place_id vem da RPC porque o grant de coluna do Q-021 impede o front de lê-lo da
    // tabela. É ele que a ficha do lote usa para achar o snapshot inteiro.
    expect(card.google_place_id).toBe("ChIJ_x");
  });

  it("lote sem snapshot volta sem nota, e não com zero fingindo nota", async () => {
    rpc("destination_prospect_cards", {
      json: [
        {
          id: "p2",
          name: "Foco Park",
          slug: "foco-park",
          address: null,
          latitude: "-8.13",
          longitude: "-34.91",
          google_maps_url: null,
          amenities: [],
          description: null,
          distance_km: null,
          reference_name: null,
          google_place_id: "ChIJ_y",
          google_rating: null,
          google_rating_count: 0,
          google_fetched_at: null,
        },
      ],
    });

    const [card] = await fetchDestinationProspects("aeroporto-de-congonhas");

    expect(card.google_rating).toBeNull();
    expect(card.google_rating_count).toBe(0);
    expect(card.google_fetched_at).toBeNull();
  });
});
