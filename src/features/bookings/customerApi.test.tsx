import { describe, expect, it, vi } from "vitest";
import { supabase } from "@/lib/supabase";
import { edge, renderMutation } from "@/test/msw/supabase";
import {
  useChangeBookingDates,
  useChangeBookingVehicle,
  useChangePaidBookingDates,
  useVoucherPdf,
} from "./customerApi";

/**
 * Contrato de rede das ações do cliente sobre a própria reserva. As quatro passam por
 * Edge Function com o JWT da pessoa, e nenhuma aceita `profile_id` no corpo: quem é o
 * dono sai do token. É isso que impede alterar a reserva de outro conhecendo o código.
 */

function comSessao(token: string | null) {
  vi.spyOn(supabase.auth, "getSession").mockResolvedValue({
    data: { session: token ? ({ access_token: token } as never) : null },
    error: null,
  } as never);
}

describe("useVoucherPdf", () => {
  it("pede o PDF pelo código da reserva", async () => {
    comSessao("token-de-teste");
    const espiao = edge("voucher-pdf", { json: { url: "https://x/v.pdf", code: "MP7K2X" } });

    const { result } = renderMutation(() => useVoucherPdf());
    const r = await result.current.mutateAsync("MP7K2X");

    expect(espiao.ultimoBody).toEqual({ code: "MP7K2X" });
    expect(r.url).toBe("https://x/v.pdf");
  });

  it("sem sessão, nem chega a pedir", async () => {
    // O voucher é o documento que abre a cancela. Sem sessão a chamada não pode sair,
    // nem para tomar 401: o código sozinho não pode virar bilhete.
    comSessao(null);
    const espiao = edge("voucher-pdf", { json: {} });

    const { result } = renderMutation(() => useVoucherPdf());
    await expect(result.current.mutateAsync("MP7K2X")).rejects.toThrow(/entrar/);
    expect(espiao.chamadas).toHaveLength(0);
  });
});

describe("useChangeBookingVehicle", () => {
  it("manda o código da reserva e o veículo escolhido", async () => {
    comSessao("token-de-teste");
    const espiao = edge("change-booking-vehicle", { json: { ok: true } });

    const { result } = renderMutation(() => useChangeBookingVehicle());
    await result.current.mutateAsync({ bookingCode: "MP7K2X", vehicleId: "v1" });

    expect(espiao.ultimoBody).toMatchObject({ booking_code: "MP7K2X" });
    expect(JSON.stringify(espiao.ultimoBody)).toContain("v1");
  });

  it("aceita placa avulsa, para quem não salvou veículo", async () => {
    comSessao("token-de-teste");
    const espiao = edge("change-booking-vehicle", { json: { ok: true } });

    const { result } = renderMutation(() => useChangeBookingVehicle());
    await result.current.mutateAsync({ bookingCode: "MP7K2X", licensePlate: "ABC1D23" });

    expect(JSON.stringify(espiao.ultimoBody)).toContain("ABC1D23");
  });

  it("recusa do servidor sobe com a mensagem dele", async () => {
    // A tarifa básica não permite trocar veículo. O motivo precisa chegar, senão a
    // pessoa tenta de novo achando que foi erro de rede.
    comSessao("token-de-teste");
    edge("change-booking-vehicle", {
      status: 403,
      json: { error: "Sua tarifa não permite trocar o veículo" },
    });

    const { result } = renderMutation(() => useChangeBookingVehicle());
    await expect(
      result.current.mutateAsync({ bookingCode: "MP7K2X", vehicleId: "v1" }),
    ).rejects.toThrow(/tarifa não permite/);
  });
});

describe("useChangeBookingDates", () => {
  it("manda código e as duas datas, com os nomes que a Edge espera", async () => {
    comSessao("token-de-teste");
    const espiao = edge("change-booking-dates", { json: { ok: true } });

    const { result } = renderMutation(() => useChangeBookingDates());
    await result.current.mutateAsync({
      bookingCode: "MP7K2X",
      checkInAt: "2027-03-10T08:00:00Z",
      checkOutAt: "2027-03-15T18:00:00Z",
    });

    expect(espiao.ultimoBody).toMatchObject({
      booking_code: "MP7K2X",
      check_in_at: "2027-03-10T08:00:00Z",
      check_out_at: "2027-03-15T18:00:00Z",
    });
  });

  it("as datas vão como vieram, sem reformatar no caminho", async () => {
    // A janela decide capacidade e preço. Perder o fuso aqui move o check-in em horas
    // e pode empurrar a reserva para outro dia de disponibilidade.
    comSessao("token-de-teste");
    const espiao = edge("change-booking-dates", { json: { ok: true } });

    const { result } = renderMutation(() => useChangeBookingDates());
    await result.current.mutateAsync({
      bookingCode: "MP7K2X",
      checkInAt: "2027-03-10T08:00:00-03:00",
      checkOutAt: "2027-03-15T18:00:00-03:00",
    });

    expect((espiao.ultimoBody as { check_in_at: string }).check_in_at).toBe(
      "2027-03-10T08:00:00-03:00",
    );
  });
});

describe("useChangePaidBookingDates", () => {
  it("usa a Edge de reserva PAGA, que é outra rota", async () => {
    // As duas parecem a mesma ação, mas só uma cobra a diferença. Chamar a errada
    // mudaria as datas de uma reserva paga sem cobrar o que faltou.
    comSessao("token-de-teste");
    const paga = edge("change-booking-dates-paid", { json: { ok: true } });
    const naoPaga = edge("change-booking-dates", { json: { ok: true } });

    const { result } = renderMutation(() => useChangePaidBookingDates());
    await result.current.mutateAsync({
      bookingCode: "MP7K2X",
      checkInAt: "2027-03-10T08:00:00Z",
      checkOutAt: "2027-03-16T18:00:00Z",
    });

    expect(paga.chamadas).toHaveLength(1);
    expect(naoPaga.chamadas).toHaveLength(0);
  });
});
