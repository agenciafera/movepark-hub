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

/**
 * Âncora do link contextual da ficha do lote para a página do destino (Conteúdo 64).
 *
 * Vale para um lote só, e por escolha. A ficha do Ponce Park herdou pelo 301 do `worker.ts` a
 * URL antiga do WordPress (`/estacionamento/ponce-park-guarulhos/`, a de maior volume da tabela
 * de redirects) e, com ela, os sites que linkavam para lá: 27 no Search Console em 13/10/2026,
 * 10 deles editoriais de viagem. A página de Guarulhos tinha 17 domínios de referência e ficava
 * entre as posições 40 e 55 nos termos de cabeça. Até aqui a ficha só linkava o destino pela
 * trilha e pelo rodapé, com "Guarulhos (GRU)" na âncora, que não é o termo que a página disputa.
 *
 * Os outros lotes mapeados ficam de fora porque não têm link externo chegando na ficha: o
 * template é um só para cerca de 150 páginas, e mudar todas sem autoridade para escoar não
 * mede nada. Lote entra aqui quando o Search Console mostrar link externo apontando para ele.
 *
 * A âncora é escrita à mão, e não montada do rótulo do destino, porque o rótulo
 * ("Guarulhos (GRU)") quebra a frase e não é o termo de cabeça.
 */
const ANCORA_PARA_O_DESTINO: Record<string, string> = {
  "aeroporto-guarulhos/ponce-park": "estacionamento no aeroporto de Guarulhos",
};

/** A âncora do link para o destino, ou null quando o lote não escoa autoridade. */
export function ancoraParaODestino(destinoSlug: string, loteSlug: string): string | null {
  return ANCORA_PARA_O_DESTINO[`${destinoSlug}/${loteSlug}`] ?? null;
}
