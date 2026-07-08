import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export type DeleteAccountResponse = { ok: true; cancelled: number; refunded: number };

/**
 * Exclusão da própria conta + anonimização (E0.9, LGPD art. 18). Chama a Edge `delete-account`
 * (server-authoritative: cancela/estorna reservas ativas, anonimiza o banco, apaga vouchers,
 * bane o login). O componente trata `signOut` + navegação no sucesso.
 */
export function useDeleteAccount() {
  return useMutation({
    mutationFn: async (): Promise<DeleteAccountResponse> => {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error("Você precisa estar logado");
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/delete-account`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `Falha ao excluir a conta (HTTP ${res.status})`);
      }
      return res.json();
    },
  });
}
