import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
import { Voucher } from "./Voucher";
import type { MyBookingDetail } from "./customerApi";

/**
 * C-15 do roteiro do consumidor. A Edge `voucher-pdf` sempre emitiu para `completed`, mas a tela
 * escondia o botão, então quem terminou a viagem tinha um voucher válido no servidor e nenhum jeito
 * de baixar. Depois do check-out o documento muda de papel: deixa de ser crachá de entrada e vira
 * comprovante. https://app.clickup.com/t/86ajmy4d2
 */

function booking(status: MyBookingDetail["status"]): MyBookingDetail {
  return {
    id: "bk-1",
    code: "MP-A8K7P2",
    status,
    check_in_at: "2026-07-10T12:00:00Z",
    check_out_at: "2026-07-12T12:00:00Z",
    expires_at: null,
    total_amount: 151.4,
    created_at: "2026-07-01T10:00:00Z",
    location: {
      name: "Aeroporto Afonso Pena",
      slug: "aeroporto-afonso-pena",
      address: "Av. Rocha Pombo, s/n",
      company: { name: "Abbapark", slug: "abbapark" },
    },
    parking_type: { name: "Vaga Coberta", code: "covered" },
    passenger_count: null,
    has_pcd: false,
    checked_in_at: null,
    fare_tier: "basica",
    fare_price_cents: 0,
    fare_cancel_until: null,
    fare_benefits: null,
    vehicle: null,
    items: [],
    payment: null,
    location_detail: {
      phone: null,
      email: null,
      notice: null,
      reservation_policy: null,
      latitude: null,
      longitude: null,
    tolerance_minutes: null,
    },
  };
}

describe("Voucher", () => {
  it("reserva confirmada: é voucher de entrada, com QR e calendário", () => {
    renderWithProviders(<Voucher booking={booking("confirmed")} />);

    // No bilhete, "Voucher" é o eyebrow; o heading é a unidade, que é o que a
    // portaria confere.
    expect(screen.getByText("Voucher")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Abbapark/ })).toBeInTheDocument();
    expect(screen.getByText("Baixar PDF")).toBeInTheDocument();
    expect(screen.getByText("Calendário")).toBeInTheDocument();
    expect(screen.getByText(/Apresente esse QR na chegada/)).toBeInTheDocument();
  });

  it("C-15: reserva concluída vira comprovante, e o botão APARECE", () => {
    renderWithProviders(<Voucher booking={booking("completed")} />);

    // O que o defeito escondia: existe caminho para baixar.
    expect(screen.getByTestId("voucher-download-pdf")).toBeInTheDocument();
    expect(screen.getByText("Baixar PDF")).toBeInTheDocument();
    expect(screen.getByText("Comprovante")).toBeInTheDocument();
    expect(screen.getByText(/Estadia concluída em/)).toBeInTheDocument();
  });

  it("C-15: no comprovante o calendário sai, mas o QR fica", async () => {
    renderWithProviders(<Voucher booking={booking("completed")} />);

    // O evento já passou: não faz sentido oferecer "adicionar ao calendário".
    expect(screen.queryByText("Calendário")).not.toBeInTheDocument();
    // A instrução de chegada some, porque não há mais chegada.
    expect(screen.queryByText(/Apresente esse QR na chegada/)).not.toBeInTheDocument();
    // O QR continua: ele aponta pra validação da reserva, que segue resolvendo
    // depois do check-out, e é por ele que se consulta o comprovante.
    // `find`: a geração do QR é assíncrona, então no primeiro quadro há skeleton.
    expect(await screen.findByRole("img", { name: /QR MP-A8K7P2/ })).toBeInTheDocument();
  });
});
