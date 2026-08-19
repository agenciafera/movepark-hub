import { describe, expect, it } from "vitest";
import { FLAG_LABEL, statusLabel, temPropostaAplicavel } from "./auditoria-enderecos.logic";
import type { LocationAddressAuditRow } from "@/types/domain";

const row = (over: Partial<LocationAddressAuditRow> = {}): LocationAddressAuditRow => ({
  location_id: "loc-1",
  location_name: "Unidade Teste",
  company_name: "Empresa Teste",
  slug: "unidade-teste",
  status: "active",
  is_listed: true,
  address: "Rua Teste, 100 - Cidade - SP",
  latitude: -23.4,
  longitude: -46.5,
  google_place_id: null,
  google_maps_url: null,
  destination_id: "dest-1",
  destination_code: "GRU",
  destination_name: "Guarulhos",
  distance_km: 1.2,
  flags: [],
  scanned_at: "2026-08-19T00:00:00Z",
  verified_at: null,
  verify_status: "pending",
  fetch_error: null,
  match_place_id: null,
  match_name: null,
  match_address: null,
  match_latitude: null,
  match_longitude: null,
  match_maps_url: null,
  match_business_status: null,
  name_similarity: null,
  drift_m: null,
  suggested_destination_code: null,
  suggested_distance_km: null,
  decision: "pending",
  decision_note: null,
  reviewed_at: null,
  ...over,
});

describe("statusLabel", () => {
  it("mostra divergente quando o Google discorda", () => {
    expect(statusLabel(row({ verify_status: "divergent" }))).toEqual({
      label: "divergente",
      tone: "cancelled",
    });
  });

  it("a decisão humana vence o veredito da máquina", () => {
    // Conferido e mantido: a divergência conhecida não pode voltar a gritar na lista todo mês.
    expect(statusLabel(row({ verify_status: "divergent", decision: "dismissed" })).label).toBe(
      "conferido",
    );
    expect(statusLabel(row({ verify_status: "divergent", decision: "applied" })).label).toBe(
      "corrigido",
    );
  });

  it("unidade nunca verificada aparece como não verificada, não como aprovada", () => {
    expect(statusLabel(row()).label).toBe("não verificado");
  });
});

describe("temPropostaAplicavel", () => {
  it("sem nada do Google não há o que aplicar", () => {
    expect(temPropostaAplicavel(row())).toBe(false);
  });

  it("coordenada proposta habilita a aplicação", () => {
    expect(temPropostaAplicavel(row({ match_latitude: -23.5, match_longitude: -46.6 }))).toBe(true);
  });

  it("endereço proposto sozinho também vale", () => {
    expect(temPropostaAplicavel(row({ match_address: "Rua Nova, 1" }))).toBe(true);
  });
});

describe("FLAG_LABEL", () => {
  it("traduz os sinais que a triagem grava", () => {
    // Os nomes vêm do SQL de location_address_scan. Se um sair de lá sem entrar aqui, a tela
    // mostra o identificador cru para quem está revisando.
    const doSql = [
      "sem_geo",
      "sem_destino",
      "sem_place_id",
      "place_id_nao_e_estabelecimento",
      "longe_do_destino",
      "endereco_incompleto",
      "endereco_sem_numero",
      "endereco_duplicado",
      "pino_duplicado",
    ];
    for (const flag of doSql) {
      expect(FLAG_LABEL[flag], `falta rótulo para ${flag}`).toBeTruthy();
    }
  });
});
