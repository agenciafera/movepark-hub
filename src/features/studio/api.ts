import { supabase } from "@/lib/supabase";

/**
 * Link autenticado do Mastra Studio, buscado no clique.
 *
 * ## Por que não é uma variável de ambiente
 *
 * O Studio autentica pelo parâmetro `auth_header`, cujo valor é o `MASTRA_ADMIN_TOKEN`:
 * acesso total à API dos agentes, incluindo ler qualquer conversa. Uma `VITE_*` seria
 * assada no bundle e servida a quem baixasse o JS, mesmo sem login. Por isso o link vem
 * da Edge `studio-link`, que confere `profiles.role = 'hub_admin'` antes de responder.
 */
export async function fetchStudioLink(): Promise<string> {
  const { data, error } = await supabase.functions.invoke("studio-link", { method: "GET" });
  if (error) throw error;
  const url = (data as { url?: string } | null)?.url;
  if (!url) throw new Error("Studio não configurado.");
  return url;
}

/**
 * Abre o Studio em aba nova.
 *
 * A aba é aberta **antes** do await, ainda dentro do gesto do clique, e só depois recebe
 * o endereço. Chamar `window.open` depois de uma promessa cai no bloqueador de pop-up da
 * maioria dos navegadores, porque a ação deixa de estar ligada ao clique.
 */
export async function abrirStudio(): Promise<void> {
  const aba = window.open("", "_blank", "noopener,noreferrer");
  try {
    const url = await fetchStudioLink();
    if (aba) aba.location.href = url;
    else window.location.href = url; // pop-up bloqueado: vai na mesma aba
  } catch (erro) {
    aba?.close();
    throw erro;
  }
}
