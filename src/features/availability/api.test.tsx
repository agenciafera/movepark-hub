import { describe, expect, it } from "vitest";
import { falha, renderMutation, rpc } from "@/test/msw/supabase";
import { useSetDateBlocked } from "./api";

/**
 * Contrato de rede do bloqueio de data. É como o parceiro fecha um dia sem mexer na
 * capacidade: útil em obra, feriado, evento. Bloquear a data errada tira do ar um dia
 * que ainda vende, e desbloquear a errada vende um dia que não existe.
 */

describe("useSetDateBlocked", () => {
  it("bloqueia a data no tipo de vaga informado", async () => {
    const espiao = rpc("operator_set_date_blocked", { json: null });

    const { result } = renderMutation(() => useSetDateBlocked());
    await result.current.mutateAsync({
      locationParkingTypeId: "lpt-9",
      date: "2027-03-10",
      blocked: true,
    });

    expect(espiao.ultimoBody).toEqual({
      p_location_parking_type_id: "lpt-9",
      p_date: "2027-03-10",
      p_blocked: true,
    });
  });

  it("desbloquear manda false, e o false não se perde", async () => {
    // Falso é o que devolve o dia para a venda. Se o campo sumisse do payload, a data
    // continuaria bloqueada enquanto o calendário mostra liberada.
    const espiao = rpc("operator_set_date_blocked", { json: null });

    const { result } = renderMutation(() => useSetDateBlocked());
    await result.current.mutateAsync({
      locationParkingTypeId: "lpt-9",
      date: "2027-03-10",
      blocked: false,
    });

    expect(espiao.ultimoBody).toHaveProperty("p_blocked", false);
  });

  it("a data vai como veio, sem passar por Date", async () => {
    // O dia é uma data civil, não um instante. Se alguém converter para Date no
    // caminho, o fuso empurra para o dia anterior e o parceiro bloqueia o 09 achando
    // que bloqueou o 10.
    const espiao = rpc("operator_set_date_blocked", { json: null });

    const { result } = renderMutation(() => useSetDateBlocked());
    await result.current.mutateAsync({
      locationParkingTypeId: "lpt-9",
      date: "2027-01-01",
      blocked: true,
    });

    expect((espiao.ultimoBody as { p_date: string }).p_date).toBe("2027-01-01");
  });

  it("propaga a recusa do servidor", async () => {
    // Bloquear dia com reserva ativa é recusado no banco, e o motivo precisa chegar.
    falha("rpc", "operator_set_date_blocked", 400, "há reservas ativas nesta data");

    const { result } = renderMutation(() => useSetDateBlocked());
    await expect(
      result.current.mutateAsync({
        locationParkingTypeId: "lpt-9",
        date: "2027-03-10",
        blocked: true,
      }),
    ).rejects.toThrow(/reservas ativas/);
  });
});
