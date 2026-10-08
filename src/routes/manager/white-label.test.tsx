import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/utils";
import ManagerWhiteLabel from "./white-label";
import { useRetryWlDelivery, useWlHealth } from "@/features/wl-health/api";
import { useTriggerWlMirror } from "@/features/parking-types/api";
import type { WlHealthReport } from "@/types/domain";

// O gate é do servidor (manager_wl_health e wl_delivery_retry exigem is_hub_admin, coberto no
// pgTAP wl_integration_health). Aqui o foco é o que a tela mostra e o botão que ela dispara.
vi.mock("@/features/wl-health/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/wl-health/api")>();
  return { ...actual, useWlHealth: vi.fn(), useRetryWlDelivery: vi.fn() };
});
vi.mock("@/features/parking-types/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/parking-types/api")>();
  return { ...actual, useTriggerWlMirror: vi.fn() };
});

const okHealth: WlHealthReport["health"] = {
  ok: true,
  motivos: [],
  entregas_falhas: 0,
  entregas_atrasadas: 0,
  reconciliacao_parada: 0,
  reconciliacao_com_erro: 0,
  espelho_com_erro: 0,
  espelho_divergente: 0,
  espelho_atrasado: 0,
  espelho_mais_antigo: null,
  limites: { entrega_minutos: 60, reconciliacao_minutos: 120, espelho_horas: 24 },
};

function setup(report: Partial<WlHealthReport>) {
  const retry = vi.fn();
  vi.mocked(useWlHealth).mockReturnValue({
    data: {
      health: okHealth,
      deliveries: [],
      recent: { delivered_24h: 12, pending: 0, last_delivered_at: null },
      units: [],
      ...report,
    },
    isLoading: false,
    isFetching: false,
    error: null,
    refetch: vi.fn(),
  } as never);
  vi.mocked(useRetryWlDelivery).mockReturnValue({ mutate: retry, isPending: false } as never);
  vi.mocked(useTriggerWlMirror).mockReturnValue({ mutate: vi.fn(), isPending: false } as never);
  renderWithProviders(<ManagerWhiteLabel />, { path: "/manager/white-label", route: "/manager/white-label" });
  return { retry };
}

describe("ManagerWhiteLabel", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("diz que está tudo em dia quando a saúde está ok", () => {
    setup({});
    expect(screen.getByText("Tudo em dia.")).toBeInTheDocument();
    expect(screen.getByText("Nenhum envio travado")).toBeInTheDocument();
  });

  it("lista os motivos quando a saúde não está ok", () => {
    setup({ health: { ...okHealth, ok: false, motivos: ["espelho_com_erro", "entrega_falhou"] } });
    expect(screen.getByText("Tem coisa pedindo atenção.")).toBeInTheDocument();
    expect(screen.getByText(/falhou ao conferir uma vaga/)).toBeInTheDocument();
    expect(screen.getByText(/recusou um envio e paramos de tentar/)).toBeInTheDocument();
  });

  it("entrega falha mostra o erro e reenvia pelo id da linha", async () => {
    const { retry } = setup({
      deliveries: [
        {
          id: "d-1",
          event_id: "bk-1:release",
          operation: "release",
          status: "failed",
          attempts: 6,
          max_attempts: 6,
          last_status: 422,
          last_error: "WL sync 422: cheio",
          next_attempt_at: "2026-10-08T12:00:00Z",
          created_at: "2026-10-08T10:00:00Z",
          start_date: null,
          end_date: null,
          booking_id: "bk-1",
          booking_code: "MP-ABC123",
          company_name: "Abbapark",
        },
      ],
    });
    expect(screen.getByRole("link", { name: "MP-ABC123" })).toHaveAttribute(
      "href",
      "/manager/bookings/MP-ABC123",
    );
    expect(screen.getByText("HTTP 422")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Reenviar" }));
    expect(retry).toHaveBeenCalledWith("d-1", expect.anything());
  });

  it("mostra o erro do espelho na vaga", () => {
    setup({
      units: [
        {
          location_parking_type_id: "lpt-1",
          company_name: "BePark",
          location_name: "Aeroporto de Confins",
          parking_type_name: "Coberta",
          checkout_mode: "hub",
          wl_sync_enabled: true,
          wl_category_slug: "c",
          wl_product_slug: "p",
          reconcile_expected: true,
          reconciled_at: new Date().toISOString(),
          reconcile_error: null,
          reconcile_error_at: null,
          mirror_status: "error",
          mirror_verified_at: new Date().toISOString(),
          mirror_sampled_at: null,
          mirror_error: "WL calculation-price 400: produto não encontrado",
        },
      ],
    });
    expect(screen.getByText("erro na última conferência")).toBeInTheDocument();
    expect(screen.getByText(/produto não encontrado/)).toBeInTheDocument();
    expect(screen.getByText("em dia")).toBeInTheDocument();
  });
});
