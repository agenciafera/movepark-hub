import { describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/utils";
import { BookingTable } from "./BookingTable";
import type { UnifiedBookingRow } from "@/types/domain";

const hub = (code: string, status: string) =>
  ({
    source: "hub",
    id: code,
    booking: {
      id: code,
      code,
      origin: "hub_search",
      status,
      total_amount: 100,
      created_at: "2026-11-10T13:00:00Z",
      check_in_at: "2026-11-11T13:00:00Z",
      check_out_at: "2026-11-13T13:00:00Z",
      payments: [],
      fare_extensions: [],
      customer_name: "Ana",
      customer_phone: "+5511999990000",
      vehicle: { license_plate: "ABC1D23" },
      location: { name: "GRU" },
    },
  }) as unknown as UnifiedBookingRow;

describe("BookingTable", () => {
  // 26/11/2026: "Diárias" e "Valor pago" pareciam o mesmo número com valores diferentes. A linha
  // agora diz quantas diárias e quanto cada uma, e o que leva das diárias ao valor pago.
  it("Diárias com a diária embaixo e Valor pago com o plano que explica a diferença", () => {
    const r = hub("MP-B59849", "confirmed");
    if (r.source !== "hub") throw new Error("fixture");
    Object.assign(r.booking, {
      total_amount: 164.1,
      price_breakdown: {
        days: 8,
        line_items: [
          { kind: "parking", subtotal: 151.2 },
          { kind: "fare", name: "Flex", tier: "flex", subtotal: 12.9 },
        ],
      },
    });
    renderWithProviders(
      <BookingTable rows={[r]} isLoading={false} valueMode="parking" columns={["code", "value", "paid"]} />,
    );
    const headers = screen.getAllByRole("columnheader").map((h) => h.textContent);
    expect(headers).toEqual(["Reserva", "Diárias", "Valor pago"]);
    const [, diarias, pago] = within(screen.getAllByRole("row")[1]!).getAllByRole("cell");
    const norm = (el: HTMLElement | undefined) => (el?.textContent ?? "").replace(/\u00a0/g, " ");
    expect(norm(diarias)).toBe("R$ 151,208 × R$ 18,90");
    expect(norm(pago)).toBe("R$ 164,10+ plano Flex R$ 12,90");
  });

  it("desenha as colunas na ordem pedida, inclusive as opcionais", () => {
    renderWithProviders(
      <BookingTable
        rows={[hub("MP-1", "confirmed")]}
        isLoading={false}
        columns={["status", "code", "plate"]}
      />,
    );
    const headers = screen.getAllByRole("columnheader").map((h) => h.textContent);
    expect(headers).toEqual(["Status", "Reserva", "Placa"]);
    expect(screen.getByText("ABC1D23")).toBeInTheDocument();
  });

  it("coluna Tipo de vaga mostra o tipo de vaga da reserva", () => {
    const r = hub("MP-TV", "confirmed");
    if (r.source !== "hub") throw new Error("fixture");
    Object.assign(r.booking, {
      items: [{ item_type: "parking", parking_type: { name: "Vaga Descoberta" } }],
    });
    renderWithProviders(
      <BookingTable rows={[r]} isLoading={false} columns={["code", "parking", "parking_type"]} />,
    );
    const headers = screen.getAllByRole("columnheader").map((h) => h.textContent);
    expect(headers).toEqual(["Reserva", "Estacionamento", "Tipo de vaga"]);
    const [, , tipo] = within(screen.getAllByRole("row")[1]!).getAllByRole("cell");
    expect(tipo).toHaveTextContent("Vaga Descoberta");
  });

  it("voucher na lista só para reserva que tem voucher (confirmada, em uso, concluída)", () => {
    renderWithProviders(
      <BookingTable
        rows={[hub("MP-OK", "confirmed"), hub("MP-EXP", "expired")]}
        isLoading={false}
        columns={["code", "voucher"]}
      />,
    );
    expect(screen.getByRole("button", { name: "Abrir voucher MP-OK" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Abrir voucher MP-EXP" })).not.toBeInTheDocument();
  });

  it("clicar no voucher não abre a reserva", async () => {
    const onRowClick = vi.fn();
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    renderWithProviders(
      <BookingTable
        rows={[hub("MP-OK", "confirmed")]}
        isLoading={false}
        columns={["code", "voucher"]}
        onRowClick={onRowClick}
      />,
    );
    const row = screen.getByText("MP-OK").closest("tr")!;
    await userEvent.click(within(row).getByRole("button", { name: "Abrir voucher MP-OK" }));
    expect(onRowClick).not.toHaveBeenCalled();
    expect(open).toHaveBeenCalled();
    open.mockRestore();
  });
});
