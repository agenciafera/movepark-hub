/**
 * A ficha de estacionamento (`/estacionamentos/<destino>/<lote>`) não usa o cabeçalho nem o
 * rodapé do consumer quando é de unidade parceira.
 *
 * Pedido da Pare Seguro (17/11/2026): o cliente sai do site do parceiro, clica em reservar e
 * chega na ficha. Com o cabeçalho, ele tinha a busca na mão e podia sair para outro
 * estacionamento no meio da compra. A ficha da unidade passa a ser só a oferta e o caminho até
 * a reserva, como o checkout já era.
 *
 * Quem decide a casca é a própria ficha, porque a mesma URL serve também o lote MAPEADO (que não
 * tem reserva, e sem cabeçalho ficaria sem saída nenhuma) e a ficha que não existe. Só o loader
 * sabe qual dos três é. O `ConsumerAppShell` usa esta função apenas para não desenhar a casca em
 * dobro nesse caminho.
 */

/** Segmentos estáticos de `/estacionamentos/<destino>/...` que não são lote. */
const SEGMENTOS_RESERVADOS = new Set(["precos", "mais-barato"]);

/** O caminho é de uma ficha de estacionamento (`/estacionamentos/<destino>/<lote>`)? */
export function ehFichaDeEstacionamento(pathname: string): boolean {
  const partes = pathname.split("/").filter(Boolean);
  return (
    partes.length === 3 && partes[0] === "estacionamentos" && !SEGMENTOS_RESERVADOS.has(partes[2])
  );
}
