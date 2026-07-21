/**
 * C-11 do roteiro do consumidor: "Minhas reservas" mostra a reserva com o tipo
 * de vaga.
 *
 * É um caso de LEITURA, mas mora no project transacional porque depende do
 * estado que o C-10 deixou. Ele não gera cobrança nova de propósito: lê do banco
 * a última reserva confirmada do cliente de teste e procura por ela na tela.
 *
 * Os arquivos rodam em ordem alfabética com `workers: 1`, então o C-10 já passou
 * quando este começa. Se ninguém rodou o C-10 antes, o teste é pulado com a
 * mensagem dizendo isso, em vez de inventar uma cobrança só para ter o que ler.
 *
 * Armadilhas do roteiro cobertas aqui:
 *   - a rota é `/bookings`, NÃO `/account/bookings`. O `AccountSidebar` não tem
 *     item de reservas, então quem procura pelo menu da conta conclui, errado,
 *     que a funcionalidade sumiu;
 *   - são 4 abas (Próximas, Em uso, Histórico, Canceladas) com estado em `?tab=`.
 *     Reserva com check-in no passado não está na aba padrão.
 */
import { test, expect } from "@playwright/test";
import { env } from "../support/env";
import { latestConfirmedBooking } from "../support/consumer";

test.describe.serial("C-11", () => {
  test("C-11: a reserva confirmada aparece com código e tipo de vaga", async ({ page }) => {
    const booking = await latestConfirmedBooking(env.customerEmail);
    test.skip(
      booking === null,
      "Nenhuma reserva confirmada para o cliente de teste. Rode o C-10 antes.",
    );

    // O check-in tem que estar no futuro pra reserva cair na aba padrão.
    const upcoming = new Date(booking!.checkInAt).getTime() > Date.now();
    await page.goto(upcoming ? "/bookings" : "/bookings?tab=history");

    await expect(page.getByRole("heading", { name: "Minhas reservas" })).toBeVisible({
      timeout: 30_000,
    });

    const card = page.getByRole("link", { name: new RegExp(booking!.code) });
    await expect(card).toBeVisible({ timeout: 30_000 });

    if (booking!.parkingTypeName) {
      await expect(card).toContainText(booking!.parkingTypeName);
    }
  });
});
