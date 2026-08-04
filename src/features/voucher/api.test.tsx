import { describe, expect, it } from "vitest";
import { falha, renderMutation, tabela } from "@/test/msw/supabase";
import { useVoucherCheckIn } from "./api";

/**
 * Contrato de rede do check-in por voucher. É o momento em que a portaria libera o
 * carro, então o que importa é o alvo e o mínimo: uma reserva, dois campos.
 *
 * Quem autoriza é a RLS `booking_operator_update` (operador da empresa ou hub_admin),
 * e isso é teste de banco. Aqui o que fica preso é o que a tela pede.
 */

describe("useVoucherCheckIn", () => {
  it("marca a reserva como checked_in com o carimbo de agora", async () => {
    const patch = tabela("booking", "patch", { json: [] });

    const { result } = renderMutation(() => useVoucherCheckIn("MP7K2X"));
    await result.current.mutateAsync("bk-9");

    const body = patch.ultimoBody as { status: string; checked_in_at: string };
    expect(body.status).toBe("checked_in");
    expect(Number.isNaN(Date.parse(body.checked_in_at))).toBe(false);
  });

  it("atualiza UMA reserva, filtrando pelo id", async () => {
    // Sem o filtro, um update em `booking` com service_role ou RLS ampla marcaria
    // entrada em toda reserva alcançável. Na portaria isso vira fila liberada em massa.
    const patch = tabela("booking", "patch", { json: [] });

    const { result } = renderMutation(() => useVoucherCheckIn("MP7K2X"));
    await result.current.mutateAsync("bk-9");

    expect(patch.chamadas[0].url).toContain("id=eq.bk-9");
  });

  it("escreve só os dois campos do check-in", async () => {
    // O patch não pode carregar mais nada: um update gordo aqui mexeria em valor,
    // datas ou veículo da reserva no momento em que a cancela abre.
    const patch = tabela("booking", "patch", { json: [] });

    const { result } = renderMutation(() => useVoucherCheckIn("MP7K2X"));
    await result.current.mutateAsync("bk-9");

    expect(Object.keys(patch.ultimoBody as object).sort()).toEqual([
      "checked_in_at",
      "status",
    ]);
  });

  it("recusa do servidor sobe, em vez de a tela dizer que liberou", async () => {
    // A RLS recusa quem não é da empresa. Engolir esse erro seria pior que o erro:
    // a portaria abriria a cancela achando que registrou.
    falha("tabela", "booking", 403, "sem permissão");

    const { result } = renderMutation(() => useVoucherCheckIn("MP7K2X"));
    await expect(result.current.mutateAsync("bk-9")).rejects.toThrow();
  });
});
