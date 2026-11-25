import { describe, expect, it } from "vitest";
import { waitFor } from "@testing-library/react";
import { edge, falha, renderMutation, rpc, tabela } from "@/test/msw/supabase";
import {
  useCreateLead,
  useDeleteSegment,
  useMoveLead,
  useRunCampaign,
  useSaveCampaign,
  useSaveColumnPrefs,
  useSaveDispatchConfig,
  useSaveSegment,
  useSaveStages,
  useSyncContacts,
} from "./api";
import { emptyCanvas } from "./canvas.logic";
import type { SegmentGroup } from "./segmentBuilder.logic";

/**
 * Contrato de rede das mutations de marketing.
 *
 * O que o servidor decide (quem é hub_admin, quem entra no segmento, se o disparo sai) é pgTAP e
 * deno test. Aqui a pergunta é outra: o hook manda o payload certo, no endpoint certo, e deixa a
 * recusa chegar até a tela em vez de engolir.
 */

describe("useSyncContacts", () => {
  it("chama a RPC de sincronização", async () => {
    const chamada = rpc("marketing_sync_contacts", { json: { inserted: 8, updated: 0 } });
    const { result } = renderMutation(() => useSyncContacts());

    const r = await result.current.mutateAsync();

    expect(chamada.chamadas.length).toBe(1);
    expect(r).toEqual({ inserted: 8, updated: 0 });
  });

  it("propaga a recusa do servidor", async () => {
    falha("rpc", "marketing_sync_contacts", 403, "Sem permissão para sincronizar contatos.");
    const { result } = renderMutation(() => useSyncContacts());

    await expect(result.current.mutateAsync()).rejects.toThrow(/Sem permissão/);
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe("useMoveLead", () => {
  it("manda lead, coluna e ordem para a RPC", async () => {
    const chamada = rpc("marketing_move_lead", { json: null });
    const { result } = renderMutation(() => useMoveLead());

    await result.current.mutateAsync({ leadId: "lead-1", stageId: "stage-2", sortOrder: 3 });

    expect(chamada.ultimoBody).toEqual({
      p_lead_id: "lead-1",
      p_stage_id: "stage-2",
      p_sort_order: 3,
    });
  });

  it("usa ordem zero quando não vem posição", async () => {
    const chamada = rpc("marketing_move_lead", { json: null });
    const { result } = renderMutation(() => useMoveLead());

    await result.current.mutateAsync({ leadId: "lead-1", stageId: "stage-2" });

    expect(chamada.ultimoBody).toMatchObject({ p_sort_order: 0 });
  });

  it("propaga lead que sumiu", async () => {
    falha("rpc", "marketing_move_lead", 404, "Lead não encontrado.");
    const { result } = renderMutation(() => useMoveLead());

    await expect(
      result.current.mutateAsync({ leadId: "sumiu", stageId: "stage-2" }),
    ).rejects.toThrow(/não encontrado/);
  });
});

describe("useCreateLead", () => {
  it("insere o lead com o contato e a unidade", async () => {
    const insert = tabela("marketing_lead", "post", { json: [{ id: "lead-9" }] });
    const { result } = renderMutation(() => useCreateLead());

    await result.current.mutateAsync({
      pipelineId: "pipe-1",
      stageId: "stage-1",
      contactId: "contact-1",
      locationId: "loc-1",
      title: "Interessado no Confins",
      valueCents: 12000,
    });

    expect(insert.ultimoBody).toMatchObject({
      pipeline_id: "pipe-1",
      stage_id: "stage-1",
      contact_id: "contact-1",
      location_id: "loc-1",
      title: "Interessado no Confins",
      value_cents: 12000,
    });
  });

  it("manda unidade nula quando o lead não tem estacionamento", async () => {
    const insert = tabela("marketing_lead", "post", { json: [{ id: "lead-9" }] });
    const { result } = renderMutation(() => useCreateLead());

    await result.current.mutateAsync({
      pipelineId: "pipe-1",
      stageId: "stage-1",
      contactId: "contact-1",
    });

    expect(insert.ultimoBody).toMatchObject({ location_id: null, value_cents: 0 });
  });
});

describe("useSaveColumnPrefs", () => {
  it("grava as colunas escolhidas no pipeline", async () => {
    const patch = tabela("marketing_pipeline", "patch", { json: [{ id: "pipe-1" }] });
    const { result } = renderMutation(() => useSaveColumnPrefs());

    await result.current.mutateAsync({
      pipelineId: "pipe-1",
      columns: ["display_name", "total_spent"],
    });

    expect(patch.ultimoBody).toEqual({ column_prefs: ["display_name", "total_spent"] });
    expect(patch.chamadas[0].url).toContain("id=eq.pipe-1");
  });
});

describe("useSaveStages", () => {
  it("atualiza coluna existente e insere a nova", async () => {
    const patch = tabela("marketing_pipeline_stage", "patch", { json: [{ id: "stage-1" }] });
    const insert = tabela("marketing_pipeline_stage", "post", { json: [{ id: "stage-2" }] });
    const { result } = renderMutation(() => useSaveStages());

    await result.current.mutateAsync({
      pipelineId: "pipe-1",
      stages: [
        { id: "stage-1", name: "Descoberta", color: "neutral", sort_order: 1 },
        { name: "Proposta", color: "violet", sort_order: 2 },
      ],
    });

    expect(patch.chamadas.length).toBe(1);
    expect(insert.chamadas.length).toBe(1);
    expect(insert.ultimoBody).toMatchObject({ pipeline_id: "pipe-1", name: "Proposta" });
  });
});

const definicao: SegmentGroup = {
  match: "all",
  rules: [{ field: "bookings_count", op: "gte", value: 2 }],
};

describe("useSaveSegment", () => {
  it("cria pela RPC, sem slug (o servidor gera)", async () => {
    const chamada = rpc("marketing_save_segment", { json: "seg-1" });
    const { result } = renderMutation(() => useSaveSegment());

    await result.current.mutateAsync({ name: "Recorrentes", definition: definicao, locationIds: ["loc-1"] });

    expect(chamada.ultimoBody).toEqual({
      p_segment_id: null,
      p_name: "Recorrentes",
      p_definition: definicao,
      p_description: null,
      p_location_ids: ["loc-1"],
    });
  });

  it("edita mandando o id", async () => {
    const chamada = rpc("marketing_save_segment", { json: "seg-1" });
    const { result } = renderMutation(() => useSaveSegment());

    await result.current.mutateAsync({ id: "seg-1", name: "Recorrentes", definition: definicao, locationIds: [] });

    expect((chamada.ultimoBody as { p_segment_id: string }).p_segment_id).toBe("seg-1");
  });

  it("mostra a recusa do servidor", async () => {
    falha("rpc", "marketing_save_segment", 400, "Segmento do modelo RFM não muda. Crie um novo a partir dele.");
    const { result } = renderMutation(() => useSaveSegment());

    await expect(
      result.current.mutateAsync({ id: "seg-1", name: "x", definition: definicao, locationIds: [] }),
    ).rejects.toThrow(/modelo RFM não muda/);
  });
});

describe("useDeleteSegment", () => {
  it("apaga pela RPC, que faz soft delete e grava a auditoria", async () => {
    const chamada = rpc("marketing_delete_segment", { status: 204 });
    const { result } = renderMutation(() => useDeleteSegment());

    await result.current.mutateAsync("seg-1");

    expect(chamada.ultimoBody).toEqual({ p_segment_id: "seg-1" });
  });
});

describe("useSaveCampaign", () => {
  it("cria pela RPC e devolve o id", async () => {
    const chamada = rpc("marketing_save_campaign", { json: "camp-1" });
    const { result } = renderMutation(() => useSaveCampaign());

    const id = await result.current.mutateAsync({ name: "Reativação", canvas: emptyCanvas() });

    expect(id).toBe("camp-1");
    expect(chamada.ultimoBody).toMatchObject({ p_campaign_id: null, p_name: "Reativação" });
  });

  it("não manda canvas quando a chamada não mexe no fluxo", async () => {
    // Canvas nulo na RPC preserva o fluxo já salvo.
    const chamada = rpc("marketing_save_campaign", { json: "camp-1" });
    const { result } = renderMutation(() => useSaveCampaign());

    await result.current.mutateAsync({ id: "camp-1", name: "Reativação" });

    expect((chamada.ultimoBody as { p_canvas: unknown }).p_canvas).toBeNull();
  });

  it("troca o status pela RPC própria", async () => {
    rpc("marketing_save_campaign", { json: "camp-1" });
    const status = rpc("marketing_set_campaign_status", { status: 204 });
    const { result } = renderMutation(() => useSaveCampaign());

    await result.current.mutateAsync({ id: "camp-1", name: "Reativação", status: "paused" });

    expect(status.ultimoBody).toEqual({ p_campaign_id: "camp-1", p_status: "paused" });
  });
});

describe("useRunCampaign", () => {
  it("chama a Edge com o id da campanha", async () => {
    const chamada = edge("marketing-run", {
      json: {
        enrolled: 5,
        processed: 5,
        sent: 0,
        skipped: 5,
        suppressed: 0,
        failed: 0,
        completed: 0,
        dispatchEnabled: false,
        testRecipient: null,
        capRemaining: 200,
      },
    });
    const { result } = renderMutation(() => useRunCampaign());

    const r = await result.current.mutateAsync("camp-1");

    expect(chamada.ultimoBody).toEqual({ campaignId: "camp-1" });
    expect(r.dispatchEnabled).toBe(false);
    expect(r.skipped).toBe(5);
  });

  it("trata erro devolvido no corpo com status 200", async () => {
    // A Edge responde `{error}` com 200 em recusa de negócio; sem esta checagem o hook
    // marcaria sucesso e a tela diria que a campanha rodou.
    edge("marketing-run", { json: { error: "canvas vazio: monte o fluxo antes de executar" } });
    const { result } = renderMutation(() => useRunCampaign());

    await expect(result.current.mutateAsync("camp-1")).rejects.toThrow(/canvas vazio/);
  });
});

describe("useSaveDispatchConfig", () => {
  it("ligar a chave geral vai pela RPC com motivo da tela", async () => {
    const chamada = rpc("marketing_set_dispatch_enabled", { json: { changed: true, enabled: true } });
    const { result } = renderMutation(() => useSaveDispatchConfig());

    await result.current.mutateAsync({ enabled: true });

    expect(chamada.ultimoBody).toEqual({ p_enabled: true, p_reason: "Alterado pela tela do Manager" });
  });

  it("desligar manda false, não vazio", async () => {
    // Regressão: `if (patch.enabled)` deixaria o desligamento passar batido, e a chave geral
    // ficaria ligada achando que tinha sido desligada.
    const chamada = rpc("marketing_set_dispatch_enabled", { json: { changed: true, enabled: false } });
    const { result } = renderMutation(() => useSaveDispatchConfig());

    await result.current.mutateAsync({ enabled: false });

    expect((chamada.ultimoBody as { p_enabled: boolean }).p_enabled).toBe(false);
  });

  it("teto e destinatário vão numa chamada só", async () => {
    const chamada = rpc("marketing_set_dispatch_config", { json: {} });
    const { result } = renderMutation(() => useSaveDispatchConfig());

    await result.current.mutateAsync({ dailyCap: 500, testRecipient: "qa@movepark.co" });

    expect(chamada.chamadas.length).toBe(1);
    expect(chamada.ultimoBody).toEqual({
      p_test_recipient: "qa@movepark.co",
      p_daily_cap: 500,
      p_email_from: null,
    });
  });
});
