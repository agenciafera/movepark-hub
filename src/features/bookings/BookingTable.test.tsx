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
