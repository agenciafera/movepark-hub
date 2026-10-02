/**
 * O traslado de uma unidade em um trecho de frase, para os artefatos de IA (llms.txt,
 * llms-full.txt e os gêmeos `.md`).
 *
 * São dois números diferentes, e o defeito que este módulo fecha era misturá-los
 * (Conteúdo 41, docs/specs/ataque-cnf-bepark.md §2.3):
 *
 * - `shuttle_minutes` é `location.shuttle_to_terminal_minutes`, o TEMPO DE TRAJETO da van
 *   até o terminal;
 * - `shuttle_frequency_minutes` é de quanto em quanto tempo a van SAI.
 *
 * O gerador escrevia o primeiro como "traslado a cada N min", e a BePark aparecia com van
 * "a cada 10 min" quando o 10 é o trajeto (o site dela diz saída a cada 20). A frequência só
 * entra quando a ficha declara uma: campo vazio não vira estimativa.
 */

/** Minutos válidos para publicar: inteiro positivo. Qualquer outra coisa é "não declarado". */
const minutos = (v) => {
  const n = Number(v);
  return v != null && Number.isFinite(n) && n > 0 ? Math.round(n) : null;
};

/**
 * Trecho que entra depois da distância, já com a vírgula na frente. Vazio quando a unidade
 * não tem traslado.
 */
export function fraseTraslado(u) {
  if (!u?.has_shuttle) return "";
  const trajeto = minutos(u.shuttle_minutes);
  const frequencia = minutos(u.shuttle_frequency_minutes);
  if (trajeto != null && frequencia != null) {
    return `, traslado de ${trajeto} min até o terminal, com van a cada ${frequencia} min`;
  }
  if (trajeto != null) return `, traslado de ${trajeto} min até o terminal`;
  if (frequencia != null) return `, traslado com van a cada ${frequencia} min`;
  return ", com traslado";
}
