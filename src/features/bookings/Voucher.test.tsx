import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
import { rpc } from "@/test/msw/supabase";
import { toDataUrl } from "@/lib/qr";
import { Voucher } from "./Voucher";
import type { MyBookingDetail } from "./customerApi";

// O conteúdo do QR é o que importa (a imagem é o pacote qrcode). Espiona o texto que vira QR.
vi.mock("@/lib/qr", () => ({ toDataUrl: vi.fn(async () => "data:image/png;base64,AAAA") }));

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
    flight_number: null,
    fare_extensions: [],
    guarantee_claims: [],
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

  describe("QR da cancela integrada (docs/specs/integracoes.md § 5.6)", () => {
    beforeEach(() => vi.mocked(toDataUrl).mockClear());

    it("com o código da Cloudpark, o QR é o código cru", async () => {
      const espiao = rpc("booking_access_code", { json: [{ code: "5d864b66-ff5f-4f98-ad6f-323c7", pending: false }] });
      renderWithProviders(<Voucher booking={booking("confirmed")} />);
      await waitFor(() => expect(toDataUrl).toHaveBeenCalledWith("5d864b66-ff5f-4f98-ad6f-323c7", 240));
      expect(espiao.chamadas[0].body).toEqual({ p_booking_code: "MP-A8K7P2" });
    });

    it("sem integração, o QR segue sendo a validação do Hub", async () => {
      rpc("booking_access_code", { json: [{ code: null, pending: false }] });
      renderWithProviders(<Voucher booking={booking("confirmed")} />);
      await waitFor(() =>
        expect(toDataUrl).toHaveBeenCalledWith(`${window.location.origin}/voucher/validate?code=MP-A8K7P2`, 240),
      );
    });

    it("enquanto o código é pedido à Cloudpark, não desenha um QR que não abriria a cancela", async () => {
      const espiao = rpc("booking_access_code", { json: [{ code: null, pending: true }] });
      renderWithProviders(<Voucher booking={booking("confirmed")} />);
      await waitFor(() => expect(espiao.chamadas.length).toBeGreaterThan(0));
      expect(toDataUrl).not.toHaveBeenCalled();
      expect(screen.queryByRole("img", { name: /QR MP-A8K7P2/ })).not.toBeInTheDocument();
    });

    it("no comprovante nem pergunta: o QR é o da validação", async () => {
      const espiao = rpc("booking_access_code", { json: [{ code: "x", pending: false }] });
      renderWithProviders(<Voucher booking={booking("completed")} />);
      await waitFor(() =>
        expect(toDataUrl).toHaveBeenCalledWith(`${window.location.origin}/voucher/validate?code=MP-A8K7P2`, 240),
      );
      expect(espiao.chamadas).toHaveLength(0);
    });
  });
});

