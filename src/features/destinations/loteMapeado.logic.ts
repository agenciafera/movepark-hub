/**
 * Título da ficha do lote mapeado (E0.17-e).
 *
 * O título prefixa "Estacionamento" no nome do lote para carregar a palavra-chave, mas
 * metade dos lotes já se chama "Estacionamento Alguma Coisa". Sem esta função o resultado
 * é "Estacionamento Estacionamento Bambuzal, em Salvador", que foi ao ar e é o texto que
 * o Google mostra na SERP.
 *
 * A palavra só conta no COMEÇO do nome: "Park Estacionamento Fácil" continua precisando do
 * prefixo, senão o título perde a keyword logo na primeira palavra, que é onde ela pesa.
 */

/** Minúsculas e sem acento, para a comparação não depender de como o nome foi digitado. */
function normalizar(s: string) {
  return s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

/**
 * `true` quando o nome já abre com a palavra (singular ou plural), e portanto dispensa o
 * prefixo. O `\b` evita casar "Estacionamentopolis", que é outra palavra.
 */
export function comecaComEstacionamento(name: string) {
  return /^estacionamentos?\b/.test(normalizar(name));
}

/** Nome do lote pronto para o título: com o prefixo só quando ele não é redundante. */
export function nomeDoLoteParaTitulo(name: string) {
  const limpo = name.trim();
  return comecaComEstacionamento(limpo) ? limpo : `Estacionamento ${limpo}`;
}

/** Título completo da ficha, o mesmo do `<title>` e do `og:title`. */
export function tituloLoteMapeado(name: string, city: string) {
  return `${nomeDoLoteParaTitulo(name)}, em ${city} | Movepark`;
}
