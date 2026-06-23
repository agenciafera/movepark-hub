import { useMutation, useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { ChatRole } from "./chat.logic";

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`;
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export type ChatConfig = { enabled: boolean; model: string };

/** Config pública da bolinha (liga/desliga + modelo). Edge `chat` (GET). */
export function useChatConfig() {
  return useQuery({
    queryKey: ["chat-config"],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<ChatConfig> => {
      const res = await fetch(CHAT_URL, { headers: { apikey: ANON } });
      if (!res.ok) return { enabled: false, model: "" };
      return res.json();
    },
  });
}

export type SendChatResult = { reply: string; used_tools: string[] };

/** Envia o histórico ao assistente. Repassa o JWT do usuário quando logado. */
export function useSendChat() {
  return useMutation({
    mutationFn: async (messages: Array<{ role: ChatRole; text: string }>): Promise<SendChatResult> => {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      const res = await fetch(CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: ANON,
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ messages }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error ?? `Falha no assistente (HTTP ${res.status})`);
      return data as SendChatResult;
    },
  });
}
