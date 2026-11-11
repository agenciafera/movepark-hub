/**
 * Colunas da lista de reservas e a escolha de cada pessoa (11/11/2026).
 *
 * Quem usa a lista (Operator, balcão, Manager) escolhe quais colunas aparecem e em que ordem. A
 * escolha mora no perfil, no banco (`profiles.preferences.ui.<chave>`, RPC `set_my_ui_preference`),
 * para valer em qualquer computador. Aqui fica só a regra pura: o catálogo de colunas e como
 * juntar a escolha salva com ele.
 *
 * A escolha salva é tratada como dado velho por natureza: coluna que deixou de existir é
 * descartada, e coluna nova (que a pessoa nunca viu) entra no fim com a visibilidade padrão dela.
 */

export type BookingColumnId =
  | "code"
  | "created"
  | "customer"
  | "parking"
  | "stay"
  | "payment"
  | "value"
  | "status"
  | "voucher"
  | "plate"
  | "phone"
  | "email";

export type BookingColumnDef = {
  id: BookingColumnId;
  /** Nome no seletor de colunas. O cabeçalho da tabela pode variar (ver `columnHeader`). */
  label: string;
  /** Aparece para quem nunca escolheu. */
  defaultVisible: boolean;
  /** Não sai da tela: sem o código a linha não identifica a reserva. */
  locked?: boolean;
};

/** Ordem padrão. É a tabela de antes desta mudança, mais voucher, e as novas escondidas. */
export const BOOKING_COLUMNS: BookingColumnDef[] = [
  { id: "code", label: "Reserva", defaultVisible: true, locked: true },
  { id: "created", label: "Criada em", defaultVisible: true },
  { id: "customer", label: "Cliente", defaultVisible: true },
  { id: "parking", label: "Estacionamento", defaultVisible: true },
  { id: "stay", label: "Estadia", defaultVisible: true },
  { id: "payment", label: "Pagamento", defaultVisible: true },
  { id: "value", label: "Valor", defaultVisible: true },
  { id: "status", label: "Status", defaultVisible: true },
  { id: "voucher", label: "Voucher", defaultVisible: true },
  { id: "plate", label: "Placa", defaultVisible: false },
  { id: "phone", label: "Telefone", defaultVisible: false },
  { id: "email", label: "E-mail", defaultVisible: false },
];

const BY_ID = new Map(BOOKING_COLUMNS.map((c) => [c.id, c]));

export type ColumnSetting = { id: BookingColumnId; visible: boolean };

/** O que vai para o banco. `version` permite mudar o formato sem confundir com o antigo. */
export type BookingColumnsPref = { version: 1; columns: ColumnSetting[] };

export function defaultColumnSettings(): ColumnSetting[] {
  return BOOKING_COLUMNS.map((c) => ({ id: c.id, visible: c.defaultVisible }));
}

/**
 * Junta a escolha salva (qualquer coisa vinda do banco) com o catálogo. Nunca lança: preferência
 * estragada vira o padrão, porque a lista de reservas não pode deixar de abrir por causa dela.
 */
export function resolveColumnSettings(saved: unknown): ColumnSetting[] {
  const raw =
    saved && typeof saved === "object" && Array.isArray((saved as { columns?: unknown }).columns)
      ? ((saved as { columns: unknown[] }).columns as unknown[])
      : null;
  if (!raw) return defaultColumnSettings();

  const seen = new Set<BookingColumnId>();
  const out: ColumnSetting[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const id = (item as { id?: unknown }).id;
    if (typeof id !== "string" || !BY_ID.has(id as BookingColumnId)) continue;
    const cid = id as BookingColumnId;
    if (seen.has(cid)) continue;
    seen.add(cid);
    const def = BY_ID.get(cid)!;
    const visible = (item as { visible?: unknown }).visible;
    out.push({ id: cid, visible: def.locked ? true : visible !== false });
  }
  // Coluna nova no catálogo: entra no fim, com a visibilidade padrão.
  for (const c of BOOKING_COLUMNS) {
    if (!seen.has(c.id)) out.push({ id: c.id, visible: c.defaultVisible });
  }
  return out;
}

/** As colunas que a tabela desenha, na ordem. */
export function visibleColumnIds(settings: ColumnSetting[]): BookingColumnId[] {
  return settings.filter((s) => s.visible).map((s) => s.id);
}

/** Sobe (-1) ou desce (+1) uma coluna. Fora dos limites, devolve igual. */
export function moveColumn(
  settings: ColumnSetting[],
  id: BookingColumnId,
  delta: -1 | 1,
): ColumnSetting[] {
  const i = settings.findIndex((s) => s.id === id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= settings.length) return settings;
  const next = [...settings];
  [next[i], next[j]] = [next[j]!, next[i]!];
  return next;
}

/** Liga ou desliga uma coluna. A travada não desliga. */
export function toggleColumn(settings: ColumnSetting[], id: BookingColumnId): ColumnSetting[] {
  if (BY_ID.get(id)?.locked) return settings;
  return settings.map((s) => (s.id === id ? { ...s, visible: !s.visible } : s));
}

export function columnDef(id: BookingColumnId): BookingColumnDef {
  return BY_ID.get(id)!;
}

/** A escolha é o padrão? (aí não precisa gravar nada, e "Restaurar padrão" fica apagado) */
export function isDefaultSettings(settings: ColumnSetting[]): boolean {
  const d = defaultColumnSettings();
  return (
    settings.length === d.length &&
    settings.every((s, i) => s.id === d[i]!.id && s.visible === d[i]!.visible)
  );
}

export function toPref(settings: ColumnSetting[]): BookingColumnsPref {
  return { version: 1, columns: settings.map((s) => ({ id: s.id, visible: s.visible })) };
}

/** Cabeçalho de cada coluna. Estacionamento e Valor mudam de nome conforme a tela. */
export function columnHeader(
  id: BookingColumnId,
  opts: { showCompany: boolean; valueMode: "total" | "parking" },
): string {
  switch (id) {
    case "code":
      return "Reserva";
    case "created":
      return "Criada em";
    case "customer":
      return "Cliente";
    case "parking":
      return opts.showCompany ? "Estacionamento" : "Unidade";
    case "stay":
      return "Estadia";
    case "payment":
      return "Pagamento";
    case "value":
      return opts.valueMode === "parking" ? "Diárias" : "Valor";
    case "status":
      return "Status";
    case "voucher":
      return "Voucher";
    case "plate":
      return "Placa";
    case "phone":
      return "Telefone";
    case "email":
      return "E-mail";
  }
}
