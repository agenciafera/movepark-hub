import { supabase } from "@/lib/supabase";
import type { LoginChannel } from "@/features/users/api";

/**
 * Registra por onde a pessoa entrou (e-mail, WhatsApp ou Google) no próprio perfil, via RPC
 * keyed em `auth.uid()`. Existe porque o Supabase não guarda isso por sessão: o OTP de e-mail e
 * o de WhatsApp chegam iguais no banco, e Manager › Usuários mostra o último canal para a equipe
 * reconhecer a conta. Nunca bloqueia o login: falha aqui é engolida, o pior caso é a coluna
 * ficar no palpite do banco.
 */
export async function recordLoginChannel(channel: LoginChannel): Promise<void> {
  try {
    const rpc = supabase.rpc.bind(supabase) as unknown as (
      fn: "record_login_channel",
      args: { p_channel: LoginChannel },
    ) => PromiseLike<{ error: { message: string } | null }>;
    await rpc("record_login_channel", { p_channel: channel });
  } catch {
    // Registro é conveniência do Manager; o login já aconteceu.
  }
}
