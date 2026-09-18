/**
 * Ritmo dos campos da barra de busca (destino, datas, veículo).
 *
 * As três superfícies moram em arquivos diferentes e precisam do MESMO respiro. Quando cada uma
 * carregava o próprio padding, o campo de veículo ficou com `px-4` enquanto os outros tinham
 * `px-6`: o rótulo colava na divisória e a barra inteira lia como encavalada. Manter os valores
 * aqui é o que impede a divergência voltar.
 *
 * Cada classe aparece escrita por extenso porque o JIT do Tailwind varre o fonte em busca do nome
 * completo; montar o nome por pedaço (`after:h-${n}`) não seria lido.
 */

/**
 * Gatilho de um campo: rótulo em cima, valor embaixo, centralizados na altura da barra.
 * `gap-1` (4px) em vez de 2px porque rótulo e valor têm o mesmo corpo (14px) e, colados, os dois
 * liam como um bloco só.
 */
export const SEARCH_FIELD_CELL =
  "flex h-full w-full flex-col items-start justify-center gap-1 rounded-full px-6 text-left transition-colors hover:bg-surface-soft";

/**
 * Divisória entre campos. No mobile (empilhado) é a linha cheia de uma lista. No pill ela vira um
 * traço curto e centrado: a régua de borda a borda transformava a barra numa grade de células e era
 * o que mais tirava o ar do bloco. O traço é um `::after` no wrapper, não uma borda no botão, senão
 * o `rounded-full` do gatilho curva a linha e abre um entalhe entre os campos.
 */
export const SEARCH_FIELD_DIVIDER =
  "border-b border-hairline tablet:relative tablet:border-b-0 tablet:after:absolute tablet:after:right-0 tablet:after:top-1/2 tablet:after:h-1/2 tablet:after:w-px tablet:after:-translate-y-1/2 tablet:after:bg-hairline tablet:after:content-['']";
