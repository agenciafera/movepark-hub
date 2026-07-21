/**
 * C-07 do roteiro do consumidor: passo 1 do checkout (identidade e contato).
 *
 * ESCREVE EM PRODUÇÃO: cria uma reserva para ter o que preencher. Sem cobrança.
 * Só roda no project `e2e-consumer-tx`.
 *
 * Armadilhas do roteiro cobertas aqui:
 *   - o telefone tem DOIS controles (seletor de país e número). Mirar no errado
 *     deixa o número vazio e o passo trava sem mensagem clara. O helper mira no
 *     `#id-phone`, que é o input do número;
 *   - o telefone é contato do PEDIDO, não credencial (ADR-006). Ele não vira
 *     login e não escreve em `auth.users.phone`. "O telefone não virou login"
 *     não é defeito;
 *   - o CPF é exigido só no passo do PIX. CPF inválido passa batido aqui e só
 *     estoura depois, o que faz parecer erro de pagamento.
 */
import { test, expect } from "@playwright/test";
import { guardTx } from "../support/consumer";
import { env } from "../support/env";
import {
  CUSTOMER_FIRST_NAME,
  CUSTOMER_LAST_NAME,
  fillIdentityStep,
  getBookingByCode,
  reserveCheapest,
} from "../support/consumer";


guardTx(test);

test.describe.serial("C-07", () => {
  test("C-07: passo 1 grava o contato no snapshot da reserva", async ({ page }) => {
    const code = await reserveCheapest(page);

    await fillIdentityStep(page);

    // Avançou pro passo 2.
    await expect(page.getByRole("heading", { name: "Veículo" })).toBeVisible({ timeout: 30_000 });

    const booking = await getBookingByCode(code);
    expect(booking).not.toBeNull();
    expect(booking!.customer_first_name).toBe(CUSTOMER_FIRST_NAME);
    expect(booking!.customer_last_name).toBe(CUSTOMER_LAST_NAME);
    expect(booking!.customer_email).toBe(env.customerEmail);
    expect(booking!.customer_phone, "o número do telefone precisa ter chegado ao snapshot")
      .toBeTruthy();
    // O contato do pedido é guardado em E.164, com o "+".
    expect(booking!.customer_phone).toMatch(/^\+\d{8,}$/);
  });
});
