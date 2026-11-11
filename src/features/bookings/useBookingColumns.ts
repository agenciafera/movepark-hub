import * as React from "react";
import { useSetUiPreference, useUiPreference } from "@/features/profile/uiPreferences";
import { resolveColumnSettings, visibleColumnIds } from "./bookingColumns.logic";

/**
 * As colunas da lista de reservas que a pessoa logada escolheu (11/11/2026). `area` separa a
 * escolha do Operator da do Manager: a mesma pessoa (admin impersonando) pode querer ver coisas
 * diferentes em cada painel.
 */
export function useBookingColumns(area: "operator" | "manager") {
  const key = `bookings_table.${area}`;
  const pref = useUiPreference(key);
  const save = useSetUiPreference(key);
  const settings = React.useMemo(() => resolveColumnSettings(pref.value), [pref.value]);
  const visible = React.useMemo(() => visibleColumnIds(settings), [settings]);
  return { settings, visible, save, canSave: !!pref.userId };
}
