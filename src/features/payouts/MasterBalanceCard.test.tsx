import { describe, expect, it } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "@/test/msw/server";
import { tabela } from "@/test/msw/supabase";
import { renderWithProviders } from "@/test/utils";
import { MasterBalanceCard } from "./MasterBalanceCard";

const BASE = import.meta.env.VITE_SUPABASE_URL;

function monta(hibrido: "true" | "false") {
  server.use(
    http.get(`${BASE}/rest/v1/gateway_account_balance`, () =>
      HttpResponse.json({ available_cents: 15635, waiting_cents: 0, transferred_cents: 0, synced_at: "2026-09-16T17:11:07Z" }),
    ),
    http.get(`${BASE}/rest/v1/app_setting`, () =>
      HttpResponse.json([
        { key: "pagarme_master_float_cents", value: "300000" },
        { key: "pagarme_split_enabled", value: "true" },
        { key: "pagarme_refund_hybrid_enabled", value: hibrido },
      ]),
    ),
  );
  const upsert = tabela("app_setting", "post", { json: [] });
  renderWithProviders(<MasterBalanceCard />);
  return upsert;
}

describe("MasterBalanceCard · estorno híbrido", () => {
  it("mostra o interruptor desligado quando a chave é false e liga gravando 'true'", async () => {
    const upsert = monta("false");
    const sw = await screen.findByRole("switch", { name: "Estorno híbrido" });
    expect(sw).not.toBeChecked();
    await userEvent.click(sw);
    await waitFor(() =>
      expect(upsert.ultimoBody).toEqual({ key: "pagarme_refund_hybrid_enabled", value: "true" }),
    );
  });

  it("com a chave ligada o interruptor nasce ligado, e o alerta do colchão continua", async () => {
    monta("true");
    expect(await screen.findByRole("switch", { name: "Estorno híbrido" })).toBeChecked();
    expect(screen.getByText(/Abaixo do colchão/)).toBeInTheDocument();
  });
});
