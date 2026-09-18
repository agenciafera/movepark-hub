// Lógica pura da vitrine pública de cupons. Sem React e sem Supabase.
//
// Ela existe separada da carteira (`couponWallet.logic.ts`) por uma diferença que não é cosmética:
// na carteira o servidor já sabe QUEM está olhando e devolve veredito. Aqui não há sessão, então
// não existe veredito nenhum, só a condição escrita. Todo texto daqui descreve a regra, nunca
// afirma que a pessoa se encaixa nela.
import { formatBRL, formatDate } from "@/lib/format";
import type { OfertaPublica } from "./api";

/** Valor em destaque: "30% OFF" ou "R$ 15 OFF". O jsonb devolve numeric como string. */
export function ofertaAmountLabel(o: Pick<OfertaPublica, "discount_type" | "discount_value">): string {
  const v = Number(o.discount_value);
  if (o.discount_type === "percent") return `${Math.round(v)}% OFF`;
  return `${formatBRL(v)} OFF`;
}

/** Teto do percentual, o "Até R$ 40" da referência. Null em valor fixo, onde o valor já é o teto. */
export function ofertaCapLabel(
  o: Pick<OfertaPublica, "discount_type" | "max_discount_amount">,
): string | null {
  if (o.discount_type !== "percent" || o.max_discount_amount == null) return null;
  return `até ${formatBRL(Number(o.max_discount_amount))}`;
}

/**
 * Quem a campanha atende, em uma frase.
 *
 * `public` devolve null de propósito: escrever "vale para todos" ocupa espaço para não dizer nada,
 * e a ausência de recorte já é a informação.
 */
export function ofertaAudienciaLabel(audience: string): string | null {
  switch (audience) {
    case "first_purchase":
      return "Vale na primeira reserva";
    case "second_purchase":
      return "Vale na segunda reserva";
    case "winback":
      return "Para quem está há um tempo sem reservar";
    default:
      return null;
  }
}

/**
 * As condições da campanha, em frases curtas.
 *
 * Elas vêm dos CAMPOS, e não do texto livre de `terms`, porque texto livre envelhece: alguém muda
 * o mínimo de diárias no formulário e o cartaz continua anunciando o número velho. O `terms` entra
 * como complemento, quando o Manager escreveu algo que os campos não contam.
 */
export function ofertaCondicoes(o: OfertaPublica): string[] {
  const linhas: string[] = [];

  const audiencia = ofertaAudienciaLabel(o.audience);
  if (audiencia) linhas.push(audiencia);

  if (o.min_days != null) {
    linhas.push(`A partir de ${o.min_days} ${o.min_days === 1 ? "diária" : "diárias"}`);
  }
  if (o.min_amount != null) {
    linhas.push(`Reservas a partir de ${formatBRL(Number(o.min_amount))}`);
  }
  if (o.valid_until) {
    linhas.push(`Válido até ${formatDate(o.valid_until)}`);
  }
  return linhas;
}

export type SeloOferta = { texto: string; tom: "destaque" | "confirmado" };

/**
 * O selo do topo do cartão, o "Cupons para novos clientes" da referência.
 *
 * Só as audiências com recorte ganham selo. `public` fica sem, porque um selo escrito "para todos"
 * ocupa a linha mais visível do cartão para não dizer nada, e aí os selos param de significar algo.
 *
 * `destaque` é reservado à primeira reserva: é a campanha de aquisição, a que precisa ser vista
 * primeiro por quem ainda não é cliente.
 */
export function ofertaSelo(audience: string): SeloOferta | null {
  switch (audience) {
    case "first_purchase":
      return { texto: "Para quem nunca reservou", tom: "destaque" };
    case "second_purchase":
      return { texto: "Para a segunda reserva", tom: "confirmado" };
    case "winback":
      return { texto: "Para quem voltou", tom: "confirmado" };
    default:
      return null;
  }
}
