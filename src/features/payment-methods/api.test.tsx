import { describe, expect, it } from "vitest";
import { falha, renderMutation, tabela } from "@/test/msw/supabase";
import {
  useCreatePaymentMethod,
  useDeletePaymentMethod,
  useSetDefaultPaymentMethod,
} from "./api";

/** Contrato de rede dos cartões salvos do cliente. */

const CARTAO = {
  profile_id: "u1",
  card_number: "4111 1111 1111 1234",
  holder_name: "QA TESTE",
  expiry_month: 12,
  expiry_year: 2030,
  is_default: false,
};

describe("useCreatePaymentMethod", () => {
  it("NUNCA manda o número completo do cartão para o servidor", async () => {
    // A asserção mais importante deste arquivo. O número entra só para derivar
    // bandeira e últimos 4; o PAN não pode trafegar nem ser gravado. Se alguém
    // acrescentar `card_number` ao insert por descuido, isso vira incidente de
    // dado de cartão, e é aqui que a mudança bate.
    const insert = tabela("payment_method", "post", { json: [] });

    const { result } = renderMutation(() => useCreatePaymentMethod());
    await result.current.mutateAsync(CARTAO);

    const enviado = JSON.stringify(insert.ultimoBody);
    expect(enviado).not.toContain("4111111111111234");
    expect(enviado).not.toContain("4111 1111 1111 1234");
    expect(insert.ultimoBody).not.toHaveProperty("card_number");
  });

  it("guarda só os últimos 4 e a bandeira derivada", async () => {
    const insert = tabela("payment_method", "post", { json: [] });

    const { result } = renderMutation(() => useCreatePaymentMethod());
    await result.current.mutateAsync(CARTAO);

    expect(insert.ultimoBody).toMatchObject({
      last4: "1234",
      brand: "visa",
      holder_name: "QA TESTE",
      expiry_month: 12,
      expiry_year: 2030,
    });
  });

  it("desmarca os outros antes de inserir, quando entra como padrão", async () => {
    const desmarca = tabela("payment_method", "patch", { json: [] });
    const insert = tabela("payment_method", "post", { json: [] });

    const { result } = renderMutation(() => useCreatePaymentMethod());
    await result.current.mutateAsync({ ...CARTAO, is_default: true });

    expect(desmarca.ultimoBody).toEqual({ is_default: false });
    expect(desmarca.chamadas[0].url).toContain("profile_id=eq.u1");
    expect(insert.chamadas).toHaveLength(1);
  });

  it("propaga o erro do insert", async () => {
    falha("tabela", "payment_method", 400, "cartão inválido");

    const { result } = renderMutation(() => useCreatePaymentMethod());
    await expect(result.current.mutateAsync(CARTAO)).rejects.toThrow();
  });
});

describe("useSetDefaultPaymentMethod", () => {
  // Atenção ao nome do argumento: aqui é `profileId` (camel), enquanto o
  // useCreatePaymentMethod logo acima recebe `profile_id` (snake). A divergência
  // é do código, não do teste, e passa despercebida porque TypeScript aceita os
  // dois em objetos diferentes. Escrever errado aqui só produz um filtro
  // `profile_id=eq.undefined`, que o Postgrest aceita calado.
  it("desmarca todos do perfil e marca só o escolhido", async () => {
    const patch = tabela("payment_method", "patch", { json: [] });

    const { result } = renderMutation(() => useSetDefaultPaymentMethod());
    await result.current.mutateAsync({ id: "pm9", profileId: "u1" });

    expect(patch.chamadas).toHaveLength(2);
    expect(patch.chamadas[0].body).toEqual({ is_default: false });
    expect(patch.chamadas[0].url).toContain("profile_id=eq.u1");
    expect(patch.chamadas[1].body).toEqual({ is_default: true });
    expect(patch.chamadas[1].url).toContain("id=eq.pm9");
  });
});

describe("useDeletePaymentMethod", () => {
  it("faz soft delete: marca deleted_at, não apaga a linha", async () => {
    const patch = tabela("payment_method", "patch", { json: [] });
    const hard = tabela("payment_method", "delete", { json: [] });

    const { result } = renderMutation(() => useDeletePaymentMethod());
    await result.current.mutateAsync("pm9");

    expect((patch.ultimoBody as { deleted_at: string }).deleted_at).toBeTruthy();
    expect(hard.chamadas).toHaveLength(0);
  });
});
