import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { RecoverableBooking } from "./recovery.logic";

export const recoveryKeys = {
  all: ["recoverable-bookings"] as const,
  list: (companyId: string) => [...recoveryKeys.all, companyId] as const,
};

/**
 * Chama a RPC. `exportar = true` faz o servidor registrar a exportação (quem, quando, quantas
 * linhas) com a contagem que ele mesmo devolveu. O gate é o escopo `bookings:recovery`.
 */
export async function fetchRecoverableBookings(
  companyId: string,
  exportar = false,
): Promise<RecoverableBooking[]> {
  const { data, error } = await supabase.rpc("operator_recoverable_bookings", {
    p_company_id: companyId,
    p_export: exportar,
  });
  if (error) throw error;
  return (data ?? []) as RecoverableBooking[];
}

/** Lista na tela. Olhar não registra exportação; baixar o CSV registra. */
export function useRecoverableBookings(companyId: string | undefined) {
  return useQuery({
    queryKey: companyId ? recoveryKeys.list(companyId) : [...recoveryKeys.all, "none"],
    enabled: !!companyId,
    queryFn: () => fetchRecoverableBookings(companyId!),
  });
}
