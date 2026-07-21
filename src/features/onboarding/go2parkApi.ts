import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

/**
 * Registra o interesse do estacionamento na Go2Park (rastreio de vans de transfer).
 * A Edge grava o flag na company_onboarding e dispara o lead por e-mail para a Go2Park.
 * Idempotente: chamar de novo não reenvia o e-mail.
 */
export function useSubmitGo2ParkInterest() {
  return useMutation({
    mutationFn: async (companyId: string) => {
      const { data, error } = await supabase.functions.invoke("submit-go2park-interest", {
        body: { company_id: companyId },
      });
      if (error) throw error;
      return data as { ok: boolean; already?: boolean };
    },
  });
}
