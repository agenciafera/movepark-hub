import { describe, expect, it } from "vitest";
import { waitFor } from "@testing-library/react";
import { falha, renderMutation, rpc } from "@/test/msw/supabase";
import {
  useDeleteProspectLocation,
  useProspectLocationPrecheck,
  useProspectLocations,
  useSaveProspectLocation,
  useSetProspectLocationState,
} from "./api";
import type { ProspectLocationInput } from "@/types/domain";

/**
 * Contrato de rede do painel de lotes mapeados (E0.17-h).
 *
 * O painel inteiro fala por RPC porque o grant de coluna de Q-021 esconde telefone e
 * place_id até do hub_admin. Isso troca o erro barulhento do PostgREST (url errada, 404)
 * por um erro mudo: nome de parâmetro trocado vira `p_foo` que a função ignora, e o
 * servidor responde 200 aplicando o default. Por isso as asserções olham o corpo enviado,
 * e não só o status.
 *
 * Quem prova que a RPC recusa quem não é hub_admin, que publicar exige endereço e que
 * ficha convertida é somente leitura é o pgTAP. Aqui a pergunta é outra: o cliente manda o
 * que disse que manda, e devolve o erro em vez de engolir.
 */

const BASE_INPUT: ProspectLocationInput = {
  id: null,
  name: "Estacionamento QA",
  slug: "estacionamento-qa",
  latitude: -23.43,
  longitude: -46.47,
  destinationId: "dest-1",
  address: "Rua QA, 100",
  phone: "+55 11 90000 0000",
  googlePlaceId: "ChIJqa",
  googleMapsUrl: "https://maps.google.com/?cid=1",
  description: "Coberto, a 500 m do terminal.",
  amenities: ["coberto", "24h"],
  dataSource: "manual",
  isPublished: false,
  researchedDailyBrl: null,
  researchedWeeklyBrl: null,
  researchedBiweeklyBrl: null,
  researchedMonthlyBrl: null,
  researchedAt: null,
  researchSource: null,
};

/** Uma linha crua da RPC: `numeric` sai como string no PostgREST. */
const LINHA_CRUA = {
  id: "pl-1",
  destination_id: "dest-1",
  destination_name: "Aeroporto de Guarulhos",
  destination_slug: "guarulhos",
  name: "Estacionamento QA",
  slug: "estacionamento-qa",
  address: "Rua QA, 100",
  phone: "+55 11 90000 0000",
  latitude: "-23.43",
  longitude: "-46.47",
  google_place_id: "ChIJqa",
  google_maps_url: null,
  amenities: ["coberto"],
  description: null,
  data_source: "import_wp",
  is_published: true,
  notified_owner_at: null,
  last_reviewed_at: null,
  converted_location_id: null,
  converted_at: null,
  converted_location_name: null,
  converted_company_id: null,
  state: "published",
  distance_m: "1012",
  place_id_conflict_name: null,
  created_at: "2026-08-01T12:00:00Z",
  updated_at: "2026-08-01T12:00:00Z",
};

describe("useProspectLocations", () => {
  it("manda destino, estado e busca no recorte pedido", async () => {
    const lista = rpc("manager_prospect_locations", { json: [LINHA_CRUA] });

    const { result } = renderMutation(() =>
      useProspectLocations({ destinationId: "dest-1", state: "draft", search: "  vila  " }),
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(lista.ultimoBody).toEqual({
      p_destination_id: "dest-1",
      p_state: "draft",
      p_search: "vila",
    });
  });

  it("filtro vazio não vira lixo no corpo", async () => {
    // `all` e busca em branco são o estado inicial da tela. Mandados como estão, a RPC
    // ainda acerta (ela trata os dois), mas o filtro entra na query key e cada variação
    // de espaço em branco viraria uma entrada de cache diferente para a mesma lista.
    const lista = rpc("manager_prospect_locations", { json: [] });

    const { result } = renderMutation(() => useProspectLocations({ state: "all", search: "   " }));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(lista.ultimoBody).toEqual({});
  });

  it("converte lat/long e distância para número", async () => {
    // Sem isso a lista ordenaria "1012" contra "980" como texto e poria o lote mais longe
    // no topo, sem nenhum erro na tela.
    rpc("manager_prospect_locations", { json: [LINHA_CRUA] });

    const { result } = renderMutation(() => useProspectLocations({}));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const linha = result.current.data![0];
    expect(linha.latitude).toBe(-23.43);
    expect(linha.longitude).toBe(-46.47);
    expect(linha.distance_m).toBe(1012);
    expect(linha.amenities).toEqual(["coberto"]);
    expect(linha.state).toBe("published");
  });

  it("amenities fora do formato não quebra a lista", async () => {
    rpc("manager_prospect_locations", { json: [{ ...LINHA_CRUA, amenities: null }] });

    const { result } = renderMutation(() => useProspectLocations({}));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data![0].amenities).toEqual([]);
  });

  it("propaga a recusa de quem não é hub_admin", async () => {
    // A RPC recusa em vez de devolver vazio de propósito: lista vazia por falta de
    // permissão se disfarça de "não há lote mapeado", que é a leitura errada numa tela
    // de curadoria. O hook precisa deixar a recusa chegar.
    falha("rpc", "manager_prospect_locations", 403, "Sem permissão para os lotes mapeados.");

    const { result } = renderMutation(() => useProspectLocations({}));
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect((result.current.error as Error).message).toContain("Sem permissão");
  });
});

describe("useSaveProspectLocation", () => {
  it("traduz o formulário camelCase para os parâmetros da RPC", async () => {
    // Este é o ponto que erra na vida real: `googlePlaceId` que não vira
    // `p_google_place_id` some calado, a RPC aplica o default e a ficha grava sem o
    // place_id que deduplica a carga.
    const save = rpc("manager_prospect_location_save", { json: "pl-novo" });

    const { result } = renderMutation(() => useSaveProspectLocation());
    const id = await result.current.mutateAsync(BASE_INPUT);

    expect(id).toBe("pl-novo");
    expect(save.ultimoBody).toEqual({
      p_id: null,
      p_name: "Estacionamento QA",
      p_slug: "estacionamento-qa",
      p_latitude: -23.43,
      p_longitude: -46.47,
      p_destination_id: "dest-1",
      p_address: "Rua QA, 100",
      p_phone: "+55 11 90000 0000",
      p_google_place_id: "ChIJqa",
      p_google_maps_url: "https://maps.google.com/?cid=1",
      p_description: "Coberto, a 500 m do terminal.",
      p_amenities: ["coberto", "24h"],
      p_data_source: "manual",
      p_is_published: false,
      // Preço pesquisado vai SEMPRE, mesmo nulo: omitir a chave esconderia de quem lê o log
      // que a ficha ficou sem preço, que é o estado da maioria delas.
      p_researched_daily_brl: null,
      p_researched_weekly_brl: null,
      p_researched_biweekly_brl: null,
      p_researched_monthly_brl: null,
      p_researched_at: null,
      p_research_source: null,
    });
  });

  it("criar manda p_id null, e não omite o parâmetro", async () => {
    // `p_id` ausente e `p_id` null são a mesma coisa para a RPC, mas mandar `undefined`
    // no objeto faria o JSON.stringify apagar a chave e esconder o caso de criação de
    // quem lê o log da requisição.
    const save = rpc("manager_prospect_location_save", { json: "pl-novo" });

    const { result } = renderMutation(() => useSaveProspectLocation());
    await result.current.mutateAsync(BASE_INPUT);

    expect(save.ultimoBody).toHaveProperty("p_id", null);
  });

  it("editar manda o id da ficha", async () => {
    const save = rpc("manager_prospect_location_save", { json: "pl-9" });

    const { result } = renderMutation(() => useSaveProspectLocation());
    await result.current.mutateAsync({ ...BASE_INPUT, id: "pl-9", isPublished: true });

    expect(save.ultimoBody).toMatchObject({ p_id: "pl-9", p_is_published: true });
  });

  it("publicar sem endereço sobe com a frase do servidor", async () => {
    // A tela precisa dizer por que não publicou. "Erro ao salvar" manda o curador
    // procurar o problema no campo errado.
    falha(
      "rpc",
      "manager_prospect_location_save",
      400,
      "Não dá para publicar sem endereço: ficha sem endereço na página de destino é thin content.",
    );

    const { result } = renderMutation(() => useSaveProspectLocation());
    await expect(
      result.current.mutateAsync({ ...BASE_INPUT, address: null, isPublished: true }),
    ).rejects.toThrow(/sem endereço/);
  });
});

describe("useSetProspectLocationState", () => {
  it("toggle de publicado não toca nos carimbos de notificado e revisado", async () => {
    // O tri-estado da RPC é o que segura isso: parâmetro ausente lê null e não mexe no
    // campo. Mandar `false` por omissão zeraria a data da campanha B2B a cada clique no
    // toggle da linha.
    const acao = rpc("manager_prospect_location_set_state", { json: null });

    const { result } = renderMutation(() => useSetProspectLocationState());
    await result.current.mutateAsync({ id: "pl-1", isPublished: true });

    expect(acao.ultimoBody).toEqual({ p_id: "pl-1", p_is_published: true });
  });

  it("marcar notificado manda só o carimbo pedido", async () => {
    const acao = rpc("manager_prospect_location_set_state", { json: null });

    const { result } = renderMutation(() => useSetProspectLocationState());
    await result.current.mutateAsync({ id: "pl-1", notified: true });

    expect(acao.ultimoBody).toEqual({ p_id: "pl-1", p_notified: true });
  });

  it("desmarcar revisado manda false, que é o que zera a data", async () => {
    // `false` e ausente são coisas diferentes aqui, e é o único lugar do painel onde
    // `false` significa apagar em vez de não mexer.
    const acao = rpc("manager_prospect_location_set_state", { json: null });

    const { result } = renderMutation(() => useSetProspectLocationState());
    await result.current.mutateAsync({ id: "pl-1", reviewed: false });

    expect(acao.ultimoBody).toEqual({ p_id: "pl-1", p_reviewed: false });
  });

  it("ficha convertida é somente leitura, e a recusa chega na tela", async () => {
    falha(
      "rpc",
      "manager_prospect_location_set_state",
      400,
      "Esta ficha já virou parceiro e não é mais editável.",
    );

    const { result } = renderMutation(() => useSetProspectLocationState());
    await expect(result.current.mutateAsync({ id: "pl-1", isPublished: true })).rejects.toThrow(
      /já virou parceiro/,
    );
  });
});

describe("useDeleteProspectLocation", () => {
  it("apaga pelo id que recebeu", async () => {
    // Exclusão aqui é delete de verdade (a tabela não tem FK de booking apontando para
    // ela). Um `p_id: undefined` sumiria do JSON e a RPC receberia o default, então a
    // asserção confere o valor e não só a chamada.
    const del = rpc("manager_prospect_location_delete", { json: null });

    const { result } = renderMutation(() => useDeleteProspectLocation());
    await result.current.mutateAsync("pl-9");

    expect(del.ultimoBody).toEqual({ p_id: "pl-9" });
  });

  it("apagar ficha convertida é recusado, e o motivo sobe", async () => {
    falha(
      "rpc",
      "manager_prospect_location_delete",
      400,
      "Esta ficha já virou parceiro; apagá-la joga fora a procedência da conversão.",
    );

    const { result } = renderMutation(() => useDeleteProspectLocation());
    await expect(result.current.mutateAsync("pl-9")).rejects.toThrow(/procedência/);
  });
});

describe("useProspectLocationPrecheck", () => {
  it("devolve destino sugerido, colisões e vizinhança já tipados", async () => {
    const precheck = rpc("manager_prospect_location_precheck", {
      json: {
        suggested_destination: { id: "dest-1", name: "Aeroporto de Guarulhos", distance_m: 1012 },
        place_id_conflict: { kind: "location", name: "Unidade parceira" },
        slug_conflict: null,
        nearby: [{ kind: "prospect", name: "Vizinho", distance_m: 80 }],
      },
    });

    const { result } = renderMutation(() => useProspectLocationPrecheck());
    const r = await result.current.mutateAsync({
      latitude: -23.43,
      longitude: -46.47,
      googlePlaceId: "ChIJqa",
      slug: "estacionamento-qa",
      id: "pl-1",
    });

    expect(precheck.ultimoBody).toEqual({
      p_latitude: -23.43,
      p_longitude: -46.47,
      p_google_place_id: "ChIJqa",
      p_slug: "estacionamento-qa",
      p_id: "pl-1",
    });
    // Colisão com unidade viva é o caso de parceiro ativo mapeado por engano (D-009): a
    // tela precisa do `kind` para dizer isso, e não só "já existe".
    expect(r.place_id_conflict).toEqual({ kind: "location", name: "Unidade parceira" });
    expect(r.suggested_destination?.distance_m).toBe(1012);
    expect(r.slug_conflict).toBeNull();
    expect(r.nearby).toHaveLength(1);
  });

  it("ficha nova manda só a coordenada", async () => {
    // Enquanto o slug não foi digitado, mandar string vazia faria a RPC procurar uma
    // colisão de slug vazio e avisar de um conflito que não existe.
    const precheck = rpc("manager_prospect_location_precheck", {
      json: {
        suggested_destination: null,
        place_id_conflict: null,
        slug_conflict: null,
        nearby: [],
      },
    });

    const { result } = renderMutation(() => useProspectLocationPrecheck());
    const r = await result.current.mutateAsync({ latitude: -23.43, longitude: -46.47 });

    expect(precheck.ultimoBody).toEqual({ p_latitude: -23.43, p_longitude: -46.47 });
    expect(r.nearby).toEqual([]);
  });

  it("propaga a recusa do servidor", async () => {
    falha(
      "rpc",
      "manager_prospect_location_precheck",
      403,
      "Sem permissão para os lotes mapeados.",
    );

    const { result } = renderMutation(() => useProspectLocationPrecheck());
    await expect(
      result.current.mutateAsync({ latitude: -23.43, longitude: -46.47 }),
    ).rejects.toThrow(/Sem permissão/);
  });
});
