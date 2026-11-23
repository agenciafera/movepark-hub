import { describe, expect, it } from "vitest";
import { waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { server } from "@/test/msw/server";
import { renderMutation, rpc } from "@/test/msw/supabase";
import { useBookingByCode, useBookingsPage, useUpdateBookingStatus } from "./api";
import { AGENDA_STATUSES } from "@/features/dashboard/operatorInsights.logic";
import { useDayAgenda, useOperatorPeriodSummary, useUpcomingBookingsCount } from "@/features/dashboard/api";
import { useStatusFunnel, useStatusFunnelRange } from "@/features/reports/api";
import { useBookingByCode as useVoucherByCode, useVoucherCheckIn } from "@/features/voucher/api";

const SUPABASE_URL = "http://localhost:54321";

/**
 * O balcão (papel Operação, sem `finance:read`) não lê `booking` nem `payment` pela API: as policies
 * só liberam a linha a quem tem o escopo financeiro (migration 20261206140100, docs/specs/
 * permissions.md "Dinheiro da reserva"). Estes testes travam o lado do cliente: com `counter`, cada
 * hook sai pela RPC `operator_*` (que nunca devolve valor) e NÃO toca a tabela; sem `counter`,
 * Dono, Gerente e Financeiro leem a tabela como sempre. O que o servidor faz é pgTAP
 * (supabase/tests/leitura_dinheiro_por_escopo.test.sql).
 */

/** Espia as leituras e escritas direto na tabela `booking`. */
function espiaTabela() {
  const pedidos: { metodo: string; url: string }[] = [];
  server.use(
    http.get(`${SUPABASE_URL}/rest/v1/booking`, ({ request }) => {
      pedidos.push({ metodo: "GET", url: request.url });
      return HttpResponse.json([]);
    }),
    http.patch(`${SUPABASE_URL}/rest/v1/booking`, ({ request }) => {
      pedidos.push({ metodo: "PATCH", url: request.url });
      return new HttpResponse(null, { status: 204 });
    }),
  );
  return pedidos;
}

const RESERVA_SEM_VALOR = {
  id: "bk-1",
  code: "MP-BALCAO",
  status: "confirmed",
  total_amount: null,
  price_breakdown: null,
  payments: [{ id: "p1", status: "paid", method: "pix", paid_at: "2026-11-23T10:00:00Z" }],
};

describe("balcão: lista de reservas", () => {
  it("com counter, a reserva do Hub vem da RPC pelos ids e a tabela não é lida", async () => {
    const tabela = espiaTabela();
    rpc("bookings_list_page", {
      json: { total: 1, items: [{ source: "hub", id: "bk-1" }], summary: null },
    });
    const porIds = rpc("operator_bookings_by_ids", { json: [RESERVA_SEM_VALOR] });
    const { result } = renderMutation(() =>
      useBookingsPage({ source: "hub", partnerView: true, counter: true, page: 0, pageSize: 50 }),
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(porIds.ultimoBody).toEqual({ p_ids: ["bk-1"] });
    const linha = result.current.data!.rows[0];
    expect(linha.source === "hub" && linha.booking.code).toBe("MP-BALCAO");
    expect(linha.source === "hub" && linha.booking.total_amount).toBeNull();
    expect(tabela).toEqual([]);
  });

  it("sem counter (quem tem finance:read), a reserva vem da tabela como sempre", async () => {
    const tabela = espiaTabela();
    rpc("bookings_list_page", {
      json: { total: 1, items: [{ source: "hub", id: "bk-1" }], summary: null },
    });
    const porIds = rpc("operator_bookings_by_ids", { json: [] });
    const { result } = renderMutation(() =>
      useBookingsPage({ source: "hub", page: 0, pageSize: 50 }),
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(porIds.chamadas).toHaveLength(0);
    expect(tabela).toHaveLength(1);
    expect(tabela[0].url).toContain("select=");
  });
});

describe("balcão: detalhe da reserva", () => {
  it("com counter, o detalhe vem da RPC pelo código e a tabela não é lida", async () => {
    const tabela = espiaTabela();
    const porCodigo = rpc("operator_booking_by_code", { json: RESERVA_SEM_VALOR });
    const { result } = renderMutation(() => useBookingByCode("MP-BALCAO", { counter: true }));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(porCodigo.ultimoBody).toEqual({ p_code: "MP-BALCAO" });
    expect(result.current.data?.code).toBe("MP-BALCAO");
    expect(tabela).toEqual([]);
  });

  it("reserva fora do alcance (a RPC devolve nulo): o detalhe diz que não achou", async () => {
    server.use(
      http.post(`${SUPABASE_URL}/rest/v1/rpc/operator_booking_by_code`, () =>
        HttpResponse.json(null),
      ),
    );
    const { result } = renderMutation(() => useBookingByCode("MP-OUTRA", { counter: true }));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });

  it("sem counter, lê a tabela", async () => {
    const tabela = espiaTabela();
    const porCodigo = rpc("operator_booking_by_code", { json: null });
    const { result } = renderMutation(() => useBookingByCode("MP-1"));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(porCodigo.chamadas).toHaveLength(0);
    expect(tabela).toHaveLength(1);
  });
});

describe("balcão: marcar a reserva (check-in, check-out, não compareceu)", () => {
  it("com counter, vai pela RPC com o carimbo certo e não faz PATCH na tabela", async () => {
    const tabela = espiaTabela();
    const marca = rpc("operator_set_booking_status", { status: 204 });
    const { result } = renderMutation(() => useUpdateBookingStatus({ counter: true }));
    await result.current.mutateAsync({
      bookingId: "bk-1",
      status: "checked_in",
      timestamp: { field: "checked_in_at", value: "2026-11-23T12:00:00Z" },
    });
    expect(marca.ultimoBody).toEqual({
      p_booking_id: "bk-1",
      p_status: "checked_in",
      p_checked_in_at: "2026-11-23T12:00:00Z",
      p_checked_out_at: null,
      p_notes: null,
      p_set_notes: false,
    });
    expect(tabela.filter((p) => p.metodo === "PATCH")).toEqual([]);
  });

  it("com counter, o check-out leva o carimbo de saída, e as notas só vão se pedidas", async () => {
    const marca = rpc("operator_set_booking_status", { status: 204 });
    const { result } = renderMutation(() => useUpdateBookingStatus({ counter: true }));
    await result.current.mutateAsync({
      bookingId: "bk-1",
      status: "completed",
      timestamp: { field: "checked_out_at", value: "2026-11-24T09:00:00Z" },
      notes: "",
    });
    expect(marca.ultimoBody).toMatchObject({
      p_status: "completed",
      p_checked_in_at: null,
      p_checked_out_at: "2026-11-24T09:00:00Z",
      p_notes: "",
      p_set_notes: true,
    });
  });

  it("a recusa do servidor chega à tela (sem escopo de reserva)", async () => {
    server.use(
      http.post(`${SUPABASE_URL}/rest/v1/rpc/operator_set_booking_status`, () =>
        HttpResponse.json({ message: "Sem permissão para marcar esta reserva" }, { status: 403 }),
      ),
    );
    const { result } = renderMutation(() => useUpdateBookingStatus({ counter: true }));
    await expect(
      result.current.mutateAsync({ bookingId: "bk-1", status: "no_show" }),
    ).rejects.toThrow("Sem permissão para marcar esta reserva");
  });

  it("sem counter, o PATCH direto continua valendo", async () => {
    const tabela = espiaTabela();
    const marca = rpc("operator_set_booking_status", { status: 204 });
    const { result } = renderMutation(() => useUpdateBookingStatus());
    await result.current.mutateAsync({ bookingId: "bk-1", status: "no_show" });
    expect(marca.chamadas).toHaveLength(0);
    expect(tabela.filter((p) => p.metodo === "PATCH")).toHaveLength(1);
  });
});

describe("balcão: agenda, dashboard e relatórios contam pela RPC sem valor", () => {
  it("agenda do dia: a RPC leva a janela, os status do pátio e as unidades", async () => {
    const tabela = espiaTabela();
    const agenda = rpc("operator_day_agenda", { json: [RESERVA_SEM_VALOR] });
    const { result } = renderMutation(() =>
      useDayAgenda("2026-11-23", ["loc-1"], { counter: true }),
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const corpo = agenda.ultimoBody as Record<string, unknown>;
    expect(corpo.p_location_ids).toEqual(["loc-1"]);
    expect(corpo.p_statuses).toEqual([...AGENDA_STATUSES]);
    expect(typeof corpo.p_from).toBe("string");
    expect(tabela).toEqual([]);
    expect(result.current.data).toHaveLength(1);
  });

  it("resumo do período: as linhas voltam com valor zero e a tabela não é lida", async () => {
    const tabela = espiaTabela();
    const fatos = rpc("operator_booking_facts", {
      json: [
        {
          check_in_at: "2026-11-10T12:00:00Z",
          check_out_at: "2026-11-12T12:00:00Z",
          created_at: "2026-11-01T12:00:00Z",
          status: "confirmed",
          created_via_api_key_id: null,
          location_id: "loc-1",
        },
      ],
    });
    const { result } = renderMutation(() =>
      useOperatorPeriodSummary(
        { from: new Date("2026-11-01T00:00:00Z"), to: new Date("2026-12-01T00:00:00Z") },
        null,
        undefined,
        { counter: true },
      ),
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fatos.ultimoBody).toMatchObject({
      p_statuses: ["confirmed", "checked_in", "completed"],
      p_location_ids: null,
    });
    expect(result.current.data?.current.count).toBe(1);
    expect(result.current.data?.current.revenue).toBe(0);
    expect(tabela).toEqual([]);
  });

  it("próximas reservas: conta as linhas da RPC, com o fim da janela incluso", async () => {
    const tabela = espiaTabela();
    const fatos = rpc("operator_booking_facts", { json: [{ status: "confirmed" }, { status: "confirmed" }] });
    const { result } = renderMutation(() => useUpcomingBookingsCount(7, undefined, { counter: true }));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBe(2);
    expect(fatos.ultimoBody).toMatchObject({
      p_to_inclusive: true,
      p_statuses: ["confirmed", "checked_in"],
    });
    expect(tabela).toEqual([]);
  });

  it("funil de status (Relatórios e dashboard): conta os status que a RPC devolve", async () => {
    const tabela = espiaTabela();
    const fatos = rpc("operator_booking_facts", {
      json: [{ status: "confirmed" }, { status: "confirmed" }, { status: "cancelled" }],
    });
    const a = renderMutation(() => useStatusFunnel(30, undefined, { counter: true }));
    await waitFor(() => expect(a.result.current.isSuccess).toBe(true));
    expect(a.result.current.data).toEqual([
      { status: "confirmed", count: 2 },
      { status: "cancelled", count: 1 },
    ]);
    expect((fatos.ultimoBody as Record<string, unknown>).p_to).toBeNull();
    const b = renderMutation(() =>
      useStatusFunnelRange("2026-11-01T00:00:00Z", "2026-12-01T00:00:00Z", ["loc-1"], {
        counter: true,
      }),
    );
    await waitFor(() => expect(b.result.current.isSuccess).toBe(true));
    expect(fatos.ultimoBody).toMatchObject({
      p_from: "2026-11-01T00:00:00Z",
      p_to: "2026-12-01T00:00:00Z",
      p_location_ids: ["loc-1"],
    });
    expect(tabela).toEqual([]);
  });

  it("sem counter, o funil lê a tabela e a RPC não é chamada", async () => {
    const tabela = espiaTabela();
    const fatos = rpc("operator_booking_facts", { json: [] });
    const { result } = renderMutation(() => useStatusFunnel(30));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fatos.chamadas).toHaveLength(0);
    expect(tabela).toHaveLength(1);
  });
});

describe("balcão: voucher no portão", () => {
  const DO_PORTAO = {
    id: "bk-1",
    code: "MP-BALCAO",
    status: "confirmed",
    check_in_at: "2026-11-23T12:00:00Z",
    check_out_at: "2026-11-25T12:00:00Z",
    checked_in_at: null,
    total_amount: null,
    vehicle: { license_plate: "ABC1D23", model: "Onix", color: "Prata" },
    location: { name: "Unidade", address: "Rua A", company: { name: "Empresa" } },
    items: [{ item_type: "parking", parking_type: { name: "Vaga coberta" } }],
  };

  it("com counter, o voucher vem da RPC (só reserva ativa, com os itens) e sem valor", async () => {
    const tabela = espiaTabela();
    const porCodigo = rpc("operator_booking_by_code", { json: DO_PORTAO });
    const { result } = renderMutation(() => useVoucherByCode("MP-BALCAO", { counter: true }));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(porCodigo.ultimoBody).toEqual({
      p_code: "MP-BALCAO",
      p_only_active: true,
      p_items: true,
    });
    expect(result.current.data).toMatchObject({
      code: "MP-BALCAO",
      total_amount: 0,
      parking_type_name: "Vaga coberta",
      vehicle: { license_plate: "ABC1D23" },
      location: { company: { name: "Empresa" } },
    });
    expect(tabela).toEqual([]);
  });

  it("com counter, o check-in do portão vai pela RPC", async () => {
    const tabela = espiaTabela();
    const marca = rpc("operator_set_booking_status", { status: 204 });
    const { result } = renderMutation(() => useVoucherCheckIn("MP-BALCAO", { counter: true }));
    await result.current.mutateAsync("bk-1");
    expect(marca.ultimoBody).toMatchObject({ p_booking_id: "bk-1", p_status: "checked_in" });
    expect(tabela.filter((p) => p.metodo === "PATCH")).toEqual([]);
  });
});
