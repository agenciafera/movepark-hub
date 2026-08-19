import { describe, expect, it } from "vitest";
import { waitFor } from "@testing-library/react";
import { edge, falha, renderMutation, rpc } from "@/test/msw/supabase";
import {
  useApplyAddressCorrection,
  useDismissAddressAudit,
  useLocationAddressAudit,
  useRunAddressScan,
  useVerifyAddresses,
} from "./api";

/**
 * Contrato de rede da auditoria de endereço.
 *
 * Quem prova que a RPC recusa quem não é hub_admin, que aplicar re-vincula o destino e que
 * meia coordenada é recusada é o pgTAP. Aqui a pergunta é outra: o cliente manda o que diz
 * que manda, converte o que o PostgREST devolve como texto, e deixa o erro chegar.
 *
 * O corpo importa mais que o status, porque nome de parâmetro trocado não dá erro: a função
 * ignora o `p_foo` desconhecido e responde 200 aplicando o default. Um `p_relink_destination`
 * escrito errado silenciaria o re-vínculo do destino sem ninguém perceber.
 */

/** Uma linha crua da RPC: `numeric` sai como string no PostgREST. */
const LINHA_CRUA = {
  location_id: "loc-1",
  location_name: "Aeroporto de Guarulhos",
  company_name: "Aerovalet",
  slug: "aeroporto-guarulhos",
  status: "active",
  is_listed: true,
  address: "Av. Novo Brasil, 954 - Guarulhos - SP",
  latitude: "-23.4766598",
  longitude: "-46.4720730",
  google_place_id: null,
  google_maps_url: null,
  destination_id: "d-gru",
  destination_code: "GRU",
  destination_name: "Guarulhos",
  distance_km: "4.77",
  flags: ["sem_place_id"],
  scanned_at: "2026-08-19T00:00:00Z",
  verified_at: null,
  verify_status: "divergent",
  fetch_error: null,
  match_place_id: "ChIJq",
  match_name: "Aerovalet",
  match_address: "Rua Certa, 55 - Guarulhos - SP",
  match_latitude: "-23.43",
  match_longitude: "-46.47",
  match_maps_url: null,
  match_business_status: "OPERATIONAL",
  name_similarity: "1",
  drift_m: "4412.3",
  suggested_destination_code: "GRU",
  suggested_distance_km: "0.72",
  decision: "pending",
  decision_note: null,
  reviewed_at: null,
};

describe("useLocationAddressAudit", () => {
  it("manda o recorte pedido e converte os numéricos", async () => {
    // Sem converter, a tela ordenaria "4412.3" contra "980" como texto e o pior caso não
    // apareceria no topo.
    const lista = rpc("manager_location_address_audit", { json: [LINHA_CRUA] });

    const { result } = renderMutation(() => useLocationAddressAudit(true));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(lista.ultimoBody).toEqual({ p_only_flagged: true });
    const linha = result.current.data![0];
    expect(linha.drift_m).toBe(4412.3);
    expect(linha.distance_km).toBe(4.77);
    expect(linha.match_latitude).toBe(-23.43);
    expect(linha.flags).toEqual(["sem_place_id"]);
  });

  it("propaga a recusa de quem não é hub_admin", async () => {
    // Lista vazia por falta de permissão se disfarça de "nenhuma pendência", que é
    // exatamente a leitura errada numa tela de auditoria.
    falha("rpc", "manager_location_address_audit", 403, "Apenas a equipe Movepark.");

    const { result } = renderMutation(() => useLocationAddressAudit(false));
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect((result.current.error as Error).message).toContain("Apenas a equipe Movepark");
  });
});

describe("useRunAddressScan", () => {
  it("devolve quantas unidades a triagem varreu", async () => {
    rpc("manager_location_address_scan", { json: 20 });

    const { result } = renderMutation(() => useRunAddressScan());
    result.current.mutate();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBe(20);
  });
});

describe("useVerifyAddresses", () => {
  it("chama a Edge sem corpo quando é a passada inteira", async () => {
    const fn = edge("location-address-audit", {
      json: { ok: true, checked: 20, ok_count: 15, divergent: 3, no_match: 2, failed: 0 },
    });

    const { result } = renderMutation(() => useVerifyAddresses());
    result.current.mutate(undefined);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(fn.ultimoBody).toEqual({});
    expect(result.current.data!.divergent).toBe(3);
  });

  it("limita a uma unidade quando o id é passado", async () => {
    const fn = edge("location-address-audit", {
      json: { ok: true, checked: 1, ok_count: 0, divergent: 1, no_match: 0, failed: 0 },
    });

    const { result } = renderMutation(() => useVerifyAddresses());
    result.current.mutate("loc-1");
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(fn.ultimoBody).toEqual({ location_id: "loc-1" });
  });

  it("mostra a falta da chave de servidor em vez de um erro genérico", async () => {
    // É a diferença entre "está quebrado" e "falta configurar a GOOGLE_PLACES_SERVER_KEY".
    falha("edge", "location-address-audit", 500, "GOOGLE_PLACES_SERVER_KEY ausente");

    const { result } = renderMutation(() => useVerifyAddresses());
    result.current.mutate(undefined);
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect((result.current.error as Error).message).toContain("GOOGLE_PLACES_SERVER_KEY");
  });
});

describe("useApplyAddressCorrection", () => {
  it("manda a coordenada proposta e pede o re-vínculo do destino", async () => {
    const fn = rpc("manager_location_address_apply", {
      json: {
        destination_before: "GRU",
        destination_after: "VCP",
        destination_changed: true,
        distance_km_before: 24.1,
        distance_km_after: 0.4,
      },
    });

    const { result } = renderMutation(() => useApplyAddressCorrection());
    result.current.mutate({
      locationId: "loc-1",
      address: "Rua Certa, 55",
      latitude: -23.43,
      longitude: -46.47,
      googlePlaceId: "ChIJq",
      note: "conferido no Maps",
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(fn.ultimoBody).toEqual({
      p_location_id: "loc-1",
      p_address: "Rua Certa, 55",
      p_latitude: -23.43,
      p_longitude: -46.47,
      p_google_place_id: "ChIJq",
      p_google_maps_url: null,
      p_relink_destination: true,
      p_note: "conferido no Maps",
    });
    expect(result.current.data!.destination_changed).toBe(true);
  });

  it("propaga a recusa de aplicar meia coordenada", async () => {
    falha(
      "rpc",
      "manager_location_address_apply",
      400,
      "Latitude e longitude precisam ser aplicadas juntas.",
    );

    const { result } = renderMutation(() => useApplyAddressCorrection());
    result.current.mutate({ locationId: "loc-1", latitude: -23.43 });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect((result.current.error as Error).message).toContain("aplicadas juntas");
  });
});

describe("useDismissAddressAudit", () => {
  it("manda a nota da revisão junto", async () => {
    const fn = rpc("manager_location_address_dismiss", { json: null });

    const { result } = renderMutation(() => useDismissAddressAudit());
    result.current.mutate({ locationId: "loc-1", note: "endereço do lote confere" });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(fn.ultimoBody).toEqual({
      p_location_id: "loc-1",
      p_note: "endereço do lote confere",
    });
  });
});
