/**
 * O nome do tipo de vaga em cada idioma.
 *
 * `parking_type.name` vem do banco em português, e aparece muitas vezes na página de
 * destino: no card, na tabela, na resposta rápida. Era a maior fonte de português
 * restante na página em inglês.
 *
 * Mapa no código, e não coluna de tradução no banco, porque o conjunto é FECHADO e
 * pequeno (sete tipos) e é vocabulário do produto, não conteúdo editorial. Criar
 * `parking_type_i18n` para sete linhas que mudam quase nunca pagaria o custo de uma
 * tabela, uma RLS e uma tela de edição para nada.
 *
 * A chave é o `code`, e não o nome: nome é texto de exibição e pode ser reescrito no
 * admin a qualquer momento, e aí o mapa pararia de casar em silêncio. Tipo
 * desconhecido cai no nome do banco, que é português, mas é melhor que espaço vazio
 * onde deveria estar o tipo de vaga.
 */

import { LOCALE_PADRAO, type Locale } from "./i18n";

const POR_CODIGO: Record<string, Partial<Record<Locale, string>>> = {
  avulsa: { en: "Single spot", es: "Plaza suelta" },
  covered: { en: "Covered spot", es: "Plaza cubierta" },
  garage: { en: "Garage / box", es: "Garaje / box" },
  motorcycle: { en: "Motorcycle spot", es: "Plaza de moto" },
  premium: { en: "Premium spot", es: "Plaza premium" },
  uncovered: { en: "Uncovered spot", es: "Plaza descubierta" },
  valet: { en: "Valet", es: "Valet" },
};

/** O nome do tipo de vaga no idioma pedido, com queda para o nome do banco. */
export function nomeDaVaga(locale: Locale, code: string | null | undefined, nomePt: string): string {
  if (locale === LOCALE_PADRAO) return nomePt;
  return (code && POR_CODIGO[code]?.[locale]) || nomePt;
}
