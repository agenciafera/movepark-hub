/**
 * C-06 do roteiro do consumidor: escolher datas cria a reserva e segura a vaga.
 *
 * ESCREVE EM PRODUÇÃO. Cria `booking` de verdade na unidade de um parceiro real
 * e consome capacidade até o hold expirar. Não gera cobrança (isso é do C-09).
 *
 * Só roda no project `e2e-consumer-tx`, que fica fora da execução padrão:
 *
 *     bunx playwright test --project=e2e-consumer-tx
 *
 * Limpeza: cancelar pela conta do cliente. Nunca `delete` em `booking`.
 *
 * Armadilhas do roteiro cobertas aqui:
 *   - sem datas escolhidas a página mostra "A partir de R$ 0,00" e "Total
 *     R$ 0,00". Zero ali é "ainda não calculado", não "de graça";
 *   - a tarifa default é a Flex, que soma sobretaxa. O helper força a Básica;
 *   - data de entrada retroativa é bloqueada, então o intervalo é derivado de
 *     "hoje" a cada execução.
 */
import { test, expect } from "@playwright/test";
import { guardTx } from "../support/consumer";
import {
  CHEAPEST_TYPE_CODE,
  MOTION_PARK,
  getBookingByCode,
  listActiveParkingTypes,
  reserveCheapest,
} from "../support/consumer";


guardTx(test);

test("C-06: reservar leva ao checkout e grava a reserva como pending", async ({ page }) => {
  const types = await listActiveParkingTypes(MOTION_PARK);
  const target = types.find((t) => t.code === CHEAPEST_TYPE_CODE);
  expect(target, `a fixture ${MOTION_PARK.operatorSlug} precisa do tipo ${CHEAPEST_TYPE_CODE}`)
    .toBeTruthy();
  expect(target!.capacity ?? 0, "sem capacidade a reserva não é criada").toBeGreaterThan(0);

  const code = await reserveCheapest(page, 2);
  expect(code).toMatch(/^MP-/);

  const booking = await getBookingByCode(code);
  expect(booking, "a reserva deveria existir no banco").not.toBeNull();
  expect(booking!.status).toBe("pending");
  expect(booking!.total_amount).toBeGreaterThan(0);

  // O hold segura a vaga: `expires_at` tem que estar no futuro.
  expect(booking!.expires_at).not.toBeNull();
  expect(new Date(booking!.expires_at!).getTime()).toBeGreaterThan(Date.now());

  // 1 diária: a saída é 24h depois da entrada.
  const nights =
    (new Date(booking!.check_out_at).getTime() - new Date(booking!.check_in_at).getTime()) /
    (1000 * 60 * 60 * 24);
  expect(nights).toBeCloseTo(1, 1);
});
