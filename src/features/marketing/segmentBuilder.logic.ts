/**
 * Gramática do construtor de segmentos. É o espelho, no front, do avaliador `marketing_eval_rule`
 * que roda no Postgres: mesmos campos, mesmos operadores, mesma semântica.
 *
 * Os dois lados existem de propósito. O banco é quem decide de verdade (é ele que resolve o
 * público na hora do disparo); o front usa isto para montar a UI, validar antes de salvar e
 * escrever o resumo em português. Se um campo novo entrar só aqui, o segmento salva e não casa
 * com ninguém, então CAMPO NOVO ENTRA NOS DOIS (ver docs/specs/marketing-automation.md).
 */

export type RuleOperator =
  | "eq"
  | "neq"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "between"
  | "in"
  | "not_in"
  | "contains"
  | "is_true"
  | "is_false"
  | "is_empty"
  | "is_present";

export type FieldKind = "number" | "money" | "text" | "enum" | "boolean" | "tags";

export type SegmentRule = {
  field: string;
  op: RuleOperator;
  value?: unknown;
};

export type SegmentGroup = {
  match: "all" | "any";
  rules: Array<SegmentRule | SegmentGroup>;
};

export function isGroup(node: SegmentRule | SegmentGroup): node is SegmentGroup {
  return (node as SegmentGroup).rules !== undefined;
}

export type FieldDef = {
  key: string;
  label: string;
  kind: FieldKind;
  /** Onde o campo aparece agrupado na UI. */
  group: "Comportamento" | "Valor" | "Growth" | "Veículo" | "Contato";
  options?: Array<{ value: string; label: string }>;
  hint?: string;
};

/**
 * Catálogo de campos. A ordem aqui é a ordem do seletor, e ela segue o que o time de growth
 * pergunta primeiro: quantas vezes comprou, quanto gastou, quando foi a última vez.
 */
export const SEGMENT_FIELDS: FieldDef[] = [
  {
    key: "bookings_count",
    label: "Reservas pagas",
    kind: "number",
    group: "Comportamento",
    hint: "Só conta reserva confirmada, com check-in ou concluída.",
  },
  {
    key: "days_since_last",
    label: "Dias desde a última compra",
    kind: "number",
    group: "Comportamento",
  },
  {
    key: "days_since_first",
    label: "Dias desde a primeira compra",
    kind: "number",
    group: "Comportamento",
  },
  {
    key: "avg_gap_days",
    label: "Intervalo médio entre compras (dias)",
    kind: "number",
    group: "Comportamento",
    hint: "A cadência da própria pessoa. Base do público de recompra.",
  },
  {
    key: "vacation_share",
    label: "Fatia de viagens em férias",
    kind: "number",
    group: "Comportamento",
    hint: "De 0 a 1, sobre janeiro, julho e dezembro. 0,7 já é um perfil sazonal.",
  },
  {
    key: "distinct_locations",
    label: "Estacionamentos diferentes usados",
    kind: "number",
    group: "Comportamento",
  },
  {
    key: "cancelled_count",
    label: "Cancelamentos e faltas",
    kind: "number",
    group: "Comportamento",
  },
  { key: "total_spent", label: "Total gasto", kind: "money", group: "Valor" },
  { key: "avg_ticket", label: "Ticket médio", kind: "money", group: "Valor" },
  {
    key: "cohort",
    label: "Coorte",
    kind: "enum",
    group: "Growth",
    options: [
      { value: "lead", label: "Lead" },
      { value: "primeira_compra", label: "Primeira compra" },
      { value: "recorrente", label: "Recorrente" },
      { value: "campeao", label: "Campeão" },
      { value: "sazonal_ferias", label: "Sazonal de férias" },
      { value: "em_risco", label: "Em risco" },
      { value: "inativo", label: "Inativo" },
    ],
  },
  {
    key: "growth_stage",
    label: "Estágio de growth",
    kind: "enum",
    group: "Growth",
    options: [
      { value: "aquisicao", label: "Aquisição" },
      { value: "ativacao", label: "Ativação" },
      { value: "retencao", label: "Retenção" },
      { value: "reativacao", label: "Reativação" },
    ],
  },
  {
    key: "subscription_candidate",
    label: "Candidato a assinante",
    kind: "boolean",
    group: "Growth",
    hint: "Já tem cadência de mensalista: volta muito ou volta rápido.",
  },
  { key: "vehicle_model", label: "Modelo do veículo", kind: "text", group: "Veículo" },
  { key: "vehicle_color", label: "Cor do veículo", kind: "text", group: "Veículo" },
  { key: "tags", label: "Etiquetas", kind: "tags", group: "Contato" },
  { key: "email_consent", label: "Aceita e-mail", kind: "boolean", group: "Contato" },
  { key: "whatsapp_consent", label: "Aceita WhatsApp", kind: "boolean", group: "Contato" },
  { key: "unsubscribed", label: "Descadastrado", kind: "boolean", group: "Contato" },
];

export function fieldDef(key: string): FieldDef | undefined {
  return SEGMENT_FIELDS.find((f) => f.key === key);
}

const OPERATOR_LABELS: Record<RuleOperator, string> = {
  eq: "é igual a",
  neq: "é diferente de",
  gt: "é maior que",
  gte: "é maior ou igual a",
  lt: "é menor que",
  lte: "é menor ou igual a",
  between: "está entre",
  in: "é um de",
  not_in: "não é nenhum de",
  contains: "contém",
  is_true: "é sim",
  is_false: "é não",
  is_empty: "está vazio",
  is_present: "tem valor",
};

export function operatorLabel(op: RuleOperator): string {
  return OPERATOR_LABELS[op] ?? op;
}

/** Operadores que fazem sentido para cada tipo de campo. */
export function operatorsFor(kind: FieldKind): RuleOperator[] {
  switch (kind) {
    case "number":
    case "money":
      return ["gte", "lte", "gt", "lt", "eq", "neq", "between", "is_empty", "is_present"];
    case "enum":
      return ["eq", "neq", "in", "not_in"];
    case "boolean":
      return ["is_true", "is_false"];
    case "tags":
      return ["contains"];
    default:
      return ["contains", "eq", "neq", "is_empty", "is_present"];
  }
}

/** Operadores que não pedem valor. A UI esconde o campo de valor para eles. */
export function operatorNeedsValue(op: RuleOperator): boolean {
  return !["is_true", "is_false", "is_empty", "is_present"].includes(op);
}

export const EMPTY_DEFINITION: SegmentGroup = { match: "all", rules: [] };

export function emptyRule(): SegmentRule {
  return { field: "bookings_count", op: "gte", value: 1 };
}

/**
 * Regra pronta para salvar? Uma regra com operador que pede valor e valor vazio casaria com todo
 * mundo no Postgres, o que transforma "quem gastou mais de X" na base inteira sem ninguém notar.
 */
export function ruleIsComplete(rule: SegmentRule): boolean {
  if (!rule.field) return false;
  if (!operatorNeedsValue(rule.op)) return true;
  if (rule.op === "between") {
    return (
      Array.isArray(rule.value) &&
      rule.value.length === 2 &&
      rule.value.every((v) => v !== "" && v !== null && v !== undefined)
    );
  }
  if (rule.op === "in" || rule.op === "not_in") {
    return Array.isArray(rule.value) && rule.value.length > 0;
  }
  return rule.value !== "" && rule.value !== null && rule.value !== undefined;
}

export type ValidationResult = { ok: boolean; problems: string[] };

/**
 * Valida a árvore inteira. Devolve TODOS os problemas de uma vez, e não só o primeiro: um
 * construtor que corrige um erro por vez faz o usuário salvar cinco vezes.
 */
export function validateDefinition(def: SegmentGroup): ValidationResult {
  const problems: string[] = [];

  function walk(node: SegmentGroup, caminho: string) {
    if (node.rules.length === 0) {
      problems.push(
        caminho === "raiz"
          ? "O segmento não tem nenhuma regra, então ele pega a base inteira."
          : `O grupo em ${caminho} está vazio.`,
      );
      return;
    }
    node.rules.forEach((filho, i) => {
      if (isGroup(filho)) {
        walk(filho, `${caminho} › grupo ${i + 1}`);
      } else if (!ruleIsComplete(filho)) {
        const def = fieldDef(filho.field);
        problems.push(`Falta o valor em "${def?.label ?? filho.field}".`);
      }
    });
  }

  walk(def, "raiz");
  return { ok: problems.length === 0, problems };
}

function formatValue(rule: SegmentRule, def: FieldDef | undefined): string {
  const v = rule.value;
  if (Array.isArray(v)) {
    const partes = v.map((item) => {
      const opt = def?.options?.find((o) => o.value === String(item));
      return opt?.label ?? String(item);
    });
    return rule.op === "between" ? partes.join(" e ") : partes.join(", ");
  }
  const opt = def?.options?.find((o) => o.value === String(v));
  return opt?.label ?? String(v ?? "");
}

/**
 * Resumo do segmento em português. Serve para conferir o que foi montado sem ler JSON, e é o que
 * aparece na lista de segmentos.
 */
export function describeDefinition(def: SegmentGroup): string {
  function walk(node: SegmentGroup): string {
    if (node.rules.length === 0) return "todos os contatos";
    const juncao = node.match === "any" ? " ou " : " e ";
    return node.rules
      .map((filho) => {
        if (isGroup(filho)) return `(${walk(filho)})`;
        const d = fieldDef(filho.field);
        const rotulo = d?.label ?? filho.field;
        if (!operatorNeedsValue(filho.op)) {
          return `${rotulo} ${operatorLabel(filho.op)}`;
        }
        return `${rotulo} ${operatorLabel(filho.op)} ${formatValue(filho, d)}`;
      })
      .join(juncao);
  }
  return walk(def);
}

/** Slug a partir do nome, para a coluna `slug` que é unique. */
export function slugify(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}
