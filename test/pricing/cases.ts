// Casos golden do motor de preço — valores verificados em docs/simulacao-precos.md
// (Hub = Produção em 2026-05-26) e nas fórmulas de docs/specs/pricing-engine.md.
// Cada caso é exercido contra a função SQL `simulate_price` (read-only) no banco vivo.
//
// NÃO gere estes valores a partir de um snapshot da função: eles são a verdade
// independente (produção/spec). Se a função divergir, o teste DEVE falhar.

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
  // ── uniform_by_duration ────────────────────────────────────────────────
  { company: "aerovalet", location: "aeroporto-congonhas", parking_type: "covered", days: 1, expected: 31.9, strategy: "uniform_by_duration" },
  { company: "aerovalet", location: "aeroporto-congonhas", parking_type: "covered", days: 6, expected: 191.4, strategy: "uniform_by_duration", note: "flip ⚠️ (6d > 7d)" },
  { company: "aerovalet", location: "aeroporto-congonhas", parking_type: "covered", days: 7, expected: 202.3, strategy: "uniform_by_duration" },
  { company: "aerovalet", location: "aeroporto-congonhas", parking_type: "covered", days: 14, expected: 404.6, strategy: "uniform_by_duration", note: "flip ⚠️ (14d > 15d)" },
  { company: "aerovalet", location: "aeroporto-congonhas", parking_type: "covered", days: 15, expected: 373.5, strategy: "uniform_by_duration" },
  { company: "aerovalet", location: "aeroporto-congonhas", parking_type: "covered", days: 35, expected: 871.5, strategy: "uniform_by_duration" },
  { company: "aerovalet", location: "aeroporto-guarulhos", parking_type: "covered", days: 1, expected: 26.9, strategy: "uniform_by_duration" },
  { company: "aerovalet", location: "aeroporto-guarulhos", parking_type: "covered", days: 14, expected: 320.6, strategy: "uniform_by_duration", note: "flip ⚠️" },
  { company: "aerovalet", location: "aeroporto-guarulhos", parking_type: "covered", days: 15, expected: 298.5, strategy: "uniform_by_duration" },
  { company: "aerovalet", location: "aeroporto-guarulhos", parking_type: "uncovered", days: 1, expected: 18.9, strategy: "uniform_by_duration" },
  { company: "aerovalet", location: "aeroporto-guarulhos", parking_type: "uncovered", days: 35, expected: 486.5, strategy: "uniform_by_duration" },
  { company: "aerovalet", location: "terminal-rodoviario-tiete", parking_type: "covered", days: 1, expected: 24.99, strategy: "uniform_by_duration" },
  { company: "aerovalet", location: "terminal-rodoviario-tiete", parking_type: "covered", days: 35, expected: 874.65, strategy: "uniform_by_duration" },
  { company: "bandeirapark", location: "aeroporto-guarulhos", parking_type: "covered", days: 1, expected: 27.9, strategy: "uniform_by_duration" },
  { company: "bandeirapark", location: "aeroporto-guarulhos", parking_type: "covered", days: 6, expected: 143.4, strategy: "uniform_by_duration" },
  { company: "bandeirapark", location: "aeroporto-guarulhos", parking_type: "covered", days: 15, expected: 358.5, strategy: "uniform_by_duration" },
  { company: "bandeirapark", location: "aeroporto-guarulhos", parking_type: "covered", days: 17, expected: 355.3, strategy: "uniform_by_duration", note: "flip ⚠️ (15d > 17d)" },
  { company: "bandeirapark", location: "aeroporto-guarulhos", parking_type: "covered", days: 35, expected: 731.5, strategy: "uniform_by_duration" },

  // ── surcharge (BUG-001: overflow 31+d herda do tipo-base) ───────────────
  { company: "aerovalet", location: "aeroporto-guarulhos", parking_type: "valet", days: 1, expected: 149, strategy: "surcharge" },
  { company: "aerovalet", location: "aeroporto-guarulhos", parking_type: "valet", days: 35, expected: 924, strategy: "surcharge", note: "regressão BUG-001" },

  // ── fixed_bracket ───────────────────────────────────────────────────────
  { company: "bandeirapark", location: "aeroporto-guarulhos", parking_type: "valet", days: 1, expected: 149, strategy: "fixed_bracket" },
  { company: "bandeirapark", location: "aeroporto-guarulhos", parking_type: "valet", days: 6, expected: 594, strategy: "fixed_bracket" },
  { company: "bandeirapark", location: "aeroporto-guarulhos", parking_type: "valet", days: 18, expected: 792, strategy: "fixed_bracket" },
  { company: "bandeirapark", location: "aeroporto-guarulhos", parking_type: "valet", days: 35, expected: 924, strategy: "fixed_bracket", note: "overflow 31+d = 792 + (d-30)×26,40" },

  // ── tiered_progressive (soma por camada) ────────────────────────────────
  { company: "abbapark", location: "aeroporto-afonso-pena", parking_type: "covered", days: 1, expected: 19.9, strategy: "tiered_progressive" },
  { company: "abbapark", location: "aeroporto-afonso-pena", parking_type: "covered", days: 7, expected: 141.3, strategy: "tiered_progressive", note: "6×19,90 + 1×21,90" },
  { company: "abbapark", location: "aeroporto-afonso-pena", parking_type: "covered", days: 35, expected: 796.5, strategy: "tiered_progressive" },
  { company: "abbapark", location: "aeroporto-afonso-pena", parking_type: "uncovered", days: 1, expected: 16.9, strategy: "tiered_progressive" },

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
