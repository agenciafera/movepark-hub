/**
 * C-01 do roteiro do consumidor: a vitrine da home mostra a curadoria de
 * /manager/destaques, na ordem em que ela foi montada.
 *
 * ESTE CASO TROCOU DE NATUREZA DUAS VEZES.
 *
 *   Até 22/07/2026 exigia que nenhuma UNIDADE aparecesse em dois cards.
 *   De 22/07 a 31/10/2026 exigia teto de 1 por EMPRESA e ordem por venda do tipo.
 *   Desde 31/10/2026 não existe teto nenhum nem ranking: a lista é curada.
 *
 * O ranking por venda saiu porque parou de medir alguma coisa. Ele conta
 * `booking` do Hub, e todas as unidades listadas de empresa ativa fecham no site
 * do parceiro (checkout externo): o contador delas nasce zero e fica zero. O
 * histórico inteiro do banco são 55 reservas em 4 unidades, a última de
 * 31/07/2026. Os dois tetos (empresa e destino) existiam para conter esse
 * ranking automático, e contra curadoria eles só brigavam com quem curou.
 *
 * Por isso os dois casos antigos foram DELETADOS em vez de ajustados: a
 * propriedade que eles protegiam deixou de ser verdade de propósito. Um teste
 * que exigisse "não repete empresa" hoje reprovaria uma decisão legítima de
 * quem edita a vitrine.
 *
 * Só LÊ. Não cria reserva nem cobrança.
 */
import { test, expect, type Page } from "@playwright/test";
import { admin } from "../support/supabaseAdmin";

/** Um href por card (cada card tem dois links pro mesmo destino: imagem e corpo). */
async function vitrineHrefs(page: Page): Promise<string[]> {
  await page.goto("/");
  const section = page.getByTestId("home-featured");
  await expect(section).toBeVisible({ timeout: 30_000 });
  await section.scrollIntoViewIfNeeded();

  const cards = section.getByTestId("home-featured-card");
  await expect(cards.first()).toBeVisible({ timeout: 30_000 });

  return cards.evaluateAll((articles) =>
    articles.map(
      (article) =>
        article.querySelector<HTMLAnchorElement>("a[href^='/p/']")?.getAttribute("href") ?? "",
    ),
  );
}

/** `/p/operador/unidade/tipo` → as três partes. */
function parseHref(href: string) {
  const [, , operador, unidade, tipo] = href.split("?")[0].split("/");
  return { operador, unidade, tipo };
}

test.describe("C-01", () => {
  test("C-01: a vitrine mostra a curadoria, na ordem curada", async ({ page }) => {
    const hrefs = await vitrineHrefs(page);
    expect(hrefs.length, "a vitrine precisa ter cards para comparar").toBeGreaterThan(0);

    for (const href of hrefs) {
      expect(href, "todo card leva pra rota de detalhe com tipo de vaga").toMatch(
        /^\/p\/[^/]+\/[^/]+\/[^/?]+/,
      );
    }

    // A verdade do servidor: a mesma RPC que a home consome, já filtrada pelo gate de publicação.
    const { data, error } = await admin.rpc("home_featured_offers");
    if (error) {
      throw new Error(`RPC home_featured_offers falhou (${error.message}).`);
    }

    const esperado = (data ?? []).map((r) => ({
      operador: r.operator_slug,
      unidade: r.location_slug,
      tipo: r.parking_type_code,
    }));

    // A tela pode mostrar MENOS que a curadoria: o card só monta com preço calculável, e uma
    // unidade sem tabela de preço fica na lista sem virar card. O que não pode é a tela mostrar
    // o que não está curado, nem inverter a ordem de quem está.
    const naTela = hrefs.map(parseHref).map(({ operador, unidade, tipo }) => ({
      operador,
      unidade,
      tipo,
    }));

    for (const card of naTela) {
      expect(
        esperado,
        `a vitrine mostra ${card.operador}/${card.unidade}/${card.tipo}, que não está na curadoria`,
      ).toContainEqual(card);
    }

    const posicoes = naTela.map((c) =>
      esperado.findIndex(
        (e) => e.operador === c.operador && e.unidade === c.unidade && e.tipo === c.tipo,
      ),
    );
    expect(
      posicoes,
      `a vitrine saiu fora da ordem curada: ${JSON.stringify(posicoes)}`,
    ).toEqual([...posicoes].sort((a, b) => a - b));
  });
});
