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

export const priceCases: PriceCase[] = [
  // ── incremental_formula (1d/2d especiais; 3+ = base + dias×mult) ─────────
  { company: "airpark", location: "faro", parking_type: "covered", days: 1, expected: 25, strategy: "incremental_formula" },
  { company: "airpark", location: "faro", parking_type: "covered", days: 2, expected: 28, strategy: "incremental_formula" },
  { company: "airpark", location: "faro", parking_type: "covered", days: 5, expected: 55, strategy: "incremental_formula", note: "10 + 5×9" },

  // ── monthly_remainder (pacote 30d + resto diário) ───────────────────────
  { company: "ferapark", location: "unidade-aeroporto", parking_type: "covered", days: 1, expected: 21.99, strategy: "monthly_remainder" },
  { company: "ferapark", location: "unidade-aeroporto", parking_type: "covered", days: 30, expected: 310, strategy: "monthly_remainder" },
  { company: "ferapark", location: "unidade-aeroporto", parking_type: "covered", days: 35, expected: 419.95, strategy: "monthly_remainder", note: "310 + 5×21,99" },

  // ── hourly_capped (teto de diária; base diária) ─────────────────────────
  { company: "moveparking", location: "nova-iguacu", parking_type: "uncovered", days: 1, expected: 20, strategy: "hourly_capped" },
  { company: "moveparking", location: "nova-iguacu", parking_type: "uncovered", days: 2, expected: 40, strategy: "hourly_capped" },
];
