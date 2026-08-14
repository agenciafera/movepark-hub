/**
 * Redes em que o vídeo de fundo não compensa.
 *
 * `3g` entra na lista de propósito. O vídeo é enfeite: num aeroporto lotado, a
 * banda que ele consome é a mesma que o usuário precisa para carregar a busca e
 * fechar a reserva, e a foto já conta a mesma história por uma fração do peso.
 */
const REDES_LENTAS = new Set(["slow-2g", "2g", "3g"]);

export type CondicoesDoAmbiente = {
  /** O sistema pediu menos movimento. */
  movimentoReduzido: boolean;
  /** O usuário ligou economia de dados no navegador. */
  economiaDeDados?: boolean;
  /** Estimativa de rede do navegador: `4g`, `3g`, `2g`, `slow-2g`. */
  tipoDeRede?: string;
};

/**
 * Decide se vale baixar o vídeo do banner.
 *
 * A foto é o estado base e nunca sai da página: ela é o LCP da home e continua
 * lá embaixo do vídeo. Esta função responde só se o vídeo entra por cima, então
 * um `false` aqui não deixa buraco nenhum, só mantém o banner parado.
 *
 * Na dúvida (navegador que não expõe `connection`) o vídeo carrega. O contrário
 * tiraria a animação de quase todo Safari, que não implementa a API.
 */
export function deveCarregarVideo(c: CondicoesDoAmbiente): boolean {
  if (c.movimentoReduzido) return false;
  if (c.economiaDeDados) return false;
  if (c.tipoDeRede && REDES_LENTAS.has(c.tipoDeRede)) return false;
  return true;
}
