import { describe, expect, it } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "@/test/msw/server";
// URL estubada em src/test/setup.ts (VITE_SUPABASE_URL).
const SUPABASE_URL = "http://localhost:54321";
import { mockAuth, mockSession, renderWithProviders } from "@/test/utils";
import { BookingColumnsPicker } from "./BookingColumnsPicker";
import { useBookingColumns } from "./useBookingColumns";

function Harness() {
  const c = useBookingColumns("operator");
  return (
    <>
      <BookingColumnsPicker settings={c.settings} save={c.save} canSave={c.canSave} />
      <div data-testid="visiveis">{c.visible.join(",")}</div>
    </>
  );
}

describe("BookingColumnsPicker", () => {
  it("salva a escolha no usuário (RPC), e a lista passa a usar o que o servidor gravou", async () => {
    let body: { p_key?: string; p_value?: { columns: { id: string; visible: boolean }[] } } = {};
    server.use(
      http.get(`${SUPABASE_URL}/rest/v1/profiles`, () =>
        HttpResponse.json({ id: "user-test", preferences: {} }),
      ),
      http.post(`${SUPABASE_URL}/rest/v1/rpc/set_my_ui_preference`, async ({ request }) => {
        body = (await request.json()) as typeof body;
        return HttpResponse.json({ [body.p_key!]: body.p_value });
      }),
    );
    renderWithProviders(<Harness />, {
      auth: mockAuth({ session: mockSession("company_operator") }),
    });

    const trigger = await screen.findByRole("button", { name: /colunas/i });
    await waitFor(() => expect(trigger).toBeEnabled());
    await userEvent.click(trigger);
    await userEvent.click(screen.getByRole("checkbox", { name: "Mostrar Placa" }));
    await userEvent.click(screen.getByRole("button", { name: "Subir Placa" }));
    await userEvent.click(screen.getByRole("button", { name: "Salvar" }));

    await waitFor(() => expect(body.p_key).toBe("bookings_table.operator"));
    const placa = body.p_value!.columns.findIndex((c) => c.id === "plate");
    expect(body.p_value!.columns[placa]).toEqual({ id: "plate", visible: true });
    expect(body.p_value!.columns[placa + 1]!.id).toBe("voucher");
    await waitFor(() =>
      expect(screen.getByTestId("visiveis").textContent).toContain("plate,voucher"),
    );
  });
});
