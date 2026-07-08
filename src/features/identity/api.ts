import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

// E0.10 · Identidade unificada. Anexar identificador verificado (telefone/e-mail) + merge, e a
// tela "Meus logins". A regra vive na Edge `attach-identifier` (ADR-006); aqui só os hooks.

export type Identities = {
  email: string | null;
  phone: string | null;
  email_verified: boolean;
  phone_verified: boolean;
  providers: { provider: string; last_sign_in_at: string | null }[];
};

export type Channel = "phone" | "email";

export type ConfirmResult =
  | { status: "attached" | "merged" }
  | { status: "needs_merge_confirm"; preview: { bookings: number; vehicles: number; saved: number; reviews: number } };

async function callAttach(payload: Record<string, unknown>) {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) throw new Error("Você precisa estar logado");
  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/attach-identifier`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? `Falha (HTTP ${res.status})`);
  }
  return res.json();
}

/** "Meus logins": identidades/credenciais do próprio usuário (RPC get_my_identities). */
export function useIdentities() {
  return useQuery({
    queryKey: ["my-identities"],
    queryFn: async (): Promise<Identities> => {
      const { data, error } = await supabase.rpc("get_my_identities");
      if (error) throw error;
      return data as unknown as Identities;
    },
  });
}

/** Envia o código OTP pro identificador informado. */
export function useRequestAttachOtp() {
  return useMutation({
    mutationFn: (args: { channel: Channel; identifier: string }) =>
      callAttach({ action: "request", ...args }),
  });
}

/** Confirma o código e anexa/funde. `allowMerge` só no 2º passo (após "conectar contas"). */
export function useConfirmAttach() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: {
      channel: Channel;
      identifier: string;
      code: string;
      allowMerge?: boolean;
    }): Promise<ConfirmResult> =>
      callAttach({
        action: "confirm",
        channel: args.channel,
        identifier: args.identifier,
        code: args.code,
        allow_merge: args.allowMerge,
      }),
    onSuccess: (res) => {
      if (res.status === "attached" || res.status === "merged") {
        qc.invalidateQueries({ queryKey: ["auth-session"] });
        qc.invalidateQueries({ queryKey: ["my-identities"] });
      }
    },
  });
}

/** Conecta uma identidade OAuth (Google) à conta atual (redireciona pro provedor). */
export function useLinkGoogle() {
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.auth.linkIdentity({
        provider: "google",
        options: { redirectTo: `${window.location.origin}/account/security` },
      });
      if (error) throw error;
    },
  });
}

/** Desconecta uma identidade OAuth. A guarda de "último login" é do chamador (UI). */
export function useUnlinkProvider() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (provider: string) => {
      const { data, error } = await supabase.auth.getUserIdentities();
      if (error) throw error;
      const identity = data.identities.find((i) => i.provider === provider);
      if (!identity) throw new Error("Identidade não encontrada");
      const { error: unlinkErr } = await supabase.auth.unlinkIdentity(identity);
      if (unlinkErr) throw unlinkErr;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["auth-session"] });
      qc.invalidateQueries({ queryKey: ["my-identities"] });
    },
  });
}
