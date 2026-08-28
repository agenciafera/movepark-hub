import { Skeleton } from "@/components/ui/skeleton";

/**
 * A espera enquanto a conversa carrega.
 *
 * Antes era um retângulo cinza de altura fixa, e ele não dizia nada: um painel claro
 * com uma faixa clara dentro se parece com painel vazio, e quem clicou não sabia se a
 * conversa estava vindo ou se não havia nada para ver.
 *
 * O desenho tem a forma da conversa que vai chegar (um balão de cada lado, larguras
 * diferentes) e uma frase que fala. A frase é o que resolve a dúvida; a forma é o que
 * evita o salto do conteúdo ao trocar o vazio pelas mensagens.
 */
export function CarregandoConversa() {
  return (
    // `aria-busy` e `aria-live` para o leitor de tela ouvir o que os olhos veem: sem
    // eles a troca de conteudo acontece em silencio.
    <div className="space-y-3" aria-busy="true" aria-live="polite">
      <p className="text-center text-body-sm text-muted">Carregando a conversa…</p>
      <Skeleton className="h-12 w-1/2 rounded-2xl" />
      <Skeleton className="ml-auto h-20 w-2/3 rounded-2xl" />
      <Skeleton className="h-10 w-2/5 rounded-2xl" />
      <Skeleton className="ml-auto h-16 w-1/2 rounded-2xl" />
    </div>
  );
}
