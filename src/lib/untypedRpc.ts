import { supabase } from "@/lib/supabase";

/**
 * Chama uma RPC que ainda não está em `database.ts` (o `gen:types` vem apagando tipos que existem;
 * ver `src/features/wl-health/api.ts`). O cast fica só aqui, e a tipagem do retorno é de quem chama.
 */
export function untypedRpc(fn: string, args: Record<string, unknown>) {
  const call = supabase.rpc.bind(supabase) as unknown as (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
  return call(fn, args);
}
