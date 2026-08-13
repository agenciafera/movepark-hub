import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

/**
 * Total de clientes atendidos, exibido no selo de prova social do Hero.
 *
 * O valor nasce cravado aqui e é servido assim no HTML do SSG: o selo aparece
 * no primeiro paint, sem esperar rede, e o crawler enxerga o número. A leitura
 * do `app_setting` só corrige o que estiver diferente, então uma falha de rede
 * ou o Supabase fora do ar degradam para o número da última publicação em vez
 * de apagar o selo.
 *
 * Atualizar sem deploy é em /manager/settings, no card "Prova social".
 */
export const CLIENTES_ATENDIDOS_PADRAO = 300_000;

export const socialProofKeys = { customers: ["social-proof", "customers"] as const };

async function fetchClientesAtendidos(): Promise<number> {
  const { data, error } = await supabase
    .from("app_setting")
    .select("value")
    .eq("key", "social_proof_customers")
    .maybeSingle();
  if (error) throw error;

  const bruto = Number(data?.value);
  /* Config é texto livre e chega de um formulário. Valor sujo ou zerado cai no
     padrão, porque "+0 clientes" no hero é pior que um número desatualizado. */
  if (!Number.isFinite(bruto) || bruto <= 0) return CLIENTES_ATENDIDOS_PADRAO;
  return Math.floor(bruto);
}

export function useClientesAtendidos() {
  const { data } = useQuery({
    queryKey: socialProofKeys.customers,
    queryFn: fetchClientesAtendidos,
    /* Número de vitrine muda de mês em mês. Reconsultar a cada navegação
       gastaria requisição para quase sempre receber o mesmo valor. */
    staleTime: 1000 * 60 * 60,
    retry: false,
  });
  return data ?? CLIENTES_ATENDIDOS_PADRAO;
}
