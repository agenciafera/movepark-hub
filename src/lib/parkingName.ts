/**
 * Nome de exibição de uma unidade, usado como título em toda superfície do consumer
 * (card da home, da busca e da `/destinos`, H1 da página do estacionamento, voucher,
 * conta do cliente).
 *
 * O título precisa responder duas perguntas ao mesmo tempo: **de quem é** e **qual
 * unidade é**. Só a empresa não basta, porque uma empresa com várias unidades vira uma
 * fila de cards idênticos (a Aerovalet tem Congonhas, Guarulhos e Tietê, e os três cards
 * diziam "Aerovalet"). Só a unidade também não basta, porque o nome da unidade se repete
 * entre empresas: "Aeroporto de Congonhas" é da Aerovalet e da Plenty Park, e "Lisboa" é
 * de três empresas diferentes. Some a marca e o cliente perde o que compara.
 *
 * Por isso o formato é `Empresa · Unidade`, com dedupe quando a unidade já carrega a
 * marca (metade das empresas cadastrou a unidade com o próprio nome, e "Virapark ·
 * Virapark" seria ruído).
 */

/** Minúsculas, sem acento e com espaços colapsados, só para comparar. */
function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** `true` quando `needle` aparece em `haystack` como palavra inteira. */
function containsWord(haystack: string, needle: string): boolean {
  if (!needle) return false;
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|\\s)${escaped}($|\\s)`).test(haystack);
}

/**
 * Título da unidade: `"Aerovalet · Aeroporto de Congonhas"`.
 *
 * - Nomes iguais (`Virapark` / `Virapark`) → `"Virapark"`.
 * - Unidade que já contém a marca (`Peu Park` / `Peu Park Zumbi dos Palmares`) → só a unidade.
 * - Falta um dos dois → o que existir; faltam os dois → string vazia.
 */
export function parkingTitle(
  companyName: string | null | undefined,
  locationName: string | null | undefined,
): string {
  const company = (companyName ?? "").trim();
  const location = (locationName ?? "").trim();
  if (!company) return location;
  if (!location) return company;

  const c = normalize(company);
  const l = normalize(location);
  if (c === l) return company;
  // A unidade já se apresenta com a marca ("Peu Park Zumbi dos Palmares"): repetir o
  // prefixo só gastaria as duas linhas de título que o card tem.
  if (containsWord(l, c)) return location;

  return `${company} · ${location}`;
}
