// Casos golden do motor de preço. Valores verificados em docs/simulacao-precos.md
// (Hub = Produção em 2026-05-26) e nas fórmulas de docs/specs/pricing-engine.md.
// Cada caso é exercido contra a função SQL `simulate_price` (read-only) no banco vivo.
//
// NÃO gere estes valores a partir de um snapshot da função: eles são a verdade
// independente (produção/spec). Se a função divergir, o teste DEVE falhar.
//
// ## Só entra aqui unidade que o Hub ainda precifica
//
// Um caso daqui usa a tabela VIVA da unidade como entrada. Quando a unidade vira externa, a
// tabela dela passa a ser espelhada do parceiro (E0.13) e muda quando o parceiro muda: o valor
// golden deixa de descrever aquela linha e o caso vira ruído vermelho.
//
// Em 10/08/2026 saíram 13 casos por isso, quando Abbapark e Aeropark (ex-Bandeirapark) viraram
// externas: 4 de `tiered_progressive` e 9 do Aeropark (5 `uniform_by_duration` + 4
// `fixed_bracket`). O `fixed_bracket` voltou pelo valet do Aerovalet, que ganhou tabela própria
// no mesmo dia.
//
// Em 12/08/2026 saíram os 17 da Aerovalet, pelo mesmo motivo: as três unidades dela (Congonhas,
// Tietê e Guarulhos) viraram externas de uma vez, e com elas foi o último `fixed_bracket` vivo
// daqui, aquele mesmo valet. As três dividem um white-label só, `aerovalet.movepark.co`, onde
// cada unidade é uma categoria.
//
// **A cobertura por estratégia não se perdeu, mudou de casa.** Ela vive em
// `supabase/tests/pricing.test.sql`, que roda contra o stack local construído do
// `supabase/seed.sql`. O seed é um retrato congelado das tabelas legadas, então
// `uniform_by_duration`, `fixed_bracket` e `tiered_progressive` continuam exercitados com os
// mesmos valores golden, e agora imunes ao que o parceiro faz com o preço dele.
//
// O que este arquivo cobre hoje, no banco vivo: `incremental_formula`, `monthly_remainder` e
// `hourly_capped`, as três estratégias que só unidade nossa pratica. Ficaram só no pgTAP o
// `uniform_by_duration`, o `fixed_bracket`, o `tiered_progressive` e o `surcharge`.

export type PriceCase = {
  company: string;
  location: string;
  parking_type: string;
  days: number;
  expected: number; // R$
  strategy: string;
  note?: string;
};

// ## 12/09/2026: a lista ficou VAZIA, e isso é o retrato correto da produção
//
// As três empresas que sobravam aqui (`airpark`, `ferapark` e `moveparking`) eram fixtures de
// demonstração, e foram desativadas em produção em 12/08/2026, as três em dois minutos
// (`company.status` virou `inactive`). O `get_pricing_data` exige `status = 'active'`, então
// desde aquele dia TODOS os casos deste arquivo devolviam "Tipo de vaga não encontrado" e o job
// `live-integration` estava vermelho na `main`. Passou quase um mês assim sem ninguém olhar.
//
// Não dá para simplesmente trocar por outra unidade. Hoje a produção só pratica duas
// estratégias em unidade ativa e listada, `fixed_bracket` e `uniform_by_duration`, e TODAS as
// unidades que as praticam são externas (aeropark, aerovalet, bepark, abbapark, nationpark,
// garageinn, plenty, virapark). Caso golden em unidade externa é justamente o que o guard
// abaixo proíbe, porque a tabela delas é espelhada do parceiro e muda quando ele mexe no preço.
//
// Ou seja: `incremental_formula`, `monthly_remainder` e `hourly_capped` saíram da produção
// junto com as fixtures. A cobertura das SETE estratégias continua inteira em
// `supabase/tests/pricing.test.sql`, contra o seed congelado, que é imune a isso.
//
// Reativar as empresas de demonstração para o teste voltar ao verde seria pior que o defeito:
// `airpark/faro` e `moveparking/nova-iguacu` têm `is_listed = true`, então elas voltariam a
// aparecer na busca do site para gente de verdade.
//
// O que o `live-integration` passou a fazer, em vez de valor golden, está no próprio
// `simulate-price.int.test.ts`: conferir que toda unidade que o site LISTA é precificável e que
// o preço publicado no índice bate com o que o simulador calcula. Esse teste não apodrece,
// porque lê o que estiver vivo.

export const priceCases: PriceCase[] = [];
