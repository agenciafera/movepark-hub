import * as React from "react";
import { ChatCircleDots, MagnifyingGlass, Envelope, EnvelopeOpen } from "@phosphor-icons/react";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Bubble } from "@/features/assistant/ChatBubble";
import {
  useConversa,
  useConversas,
  useMarcarConversa,
  type ConversaDaLista,
} from "@/features/inbox/api";
import {
  filtrar,
  naoLida,
  quando,
  rotuloDoTelefone,
  type FiltroDaCaixa,
} from "@/features/inbox/inbox.logic";

/**
 * Caixa de entrada das conversas da Mia.
 *
 * Lista à esquerda, conversa à direita, como todo mundo espera de um painel de
 * atendimento. O Studio do Mastra mostra as mesmas conversas, mas por id cru e sem
 * busca: serve para depurar, não para acompanhar cliente.
 *
 * As conversas vivem no Postgres do BeastBots, outro projeto Supabase, então tudo passa
 * pela Edge `mia-inbox`. Ver `features/inbox/api.ts`.
 */
export default function ManagerConversas() {
  const [busca, setBusca] = React.useState("");
  const [filtro, setFiltro] = React.useState<FiltroDaCaixa>("todas");
  const [aberta, setAberta] = React.useState<string | null>(null);

  const lista = useConversas();
  const conversa = useConversa(aberta);
  const marcar = useMarcarConversa();

  const visiveis = React.useMemo(
    () => filtrar(lista.data, filtro, busca),
    [lista.data, filtro, busca],
  );

  const totalNaoLidas = React.useMemo(
    () => (lista.data ?? []).filter(naoLida).length,
    [lista.data],
  );

  /**
   * Abrir uma conversa marca como lida.
   *
   * É o que a pessoa espera, e evita o passo manual que ninguém faz. Marcar de volta
   * como não lida continua existindo, no botão do cabeçalho.
   */
  function abrir(c: ConversaDaLista) {
    setAberta(c.id);
    if (naoLida(c)) marcar.mutate({ threadId: c.id, lida: true });
  }

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col gap-4">
      <PageHeader
        title="Conversas"
        description="O que os clientes falam com a Mia no WhatsApp, em tempo quase real."
        actions={
          totalNaoLidas > 0 ? (
            <span className="rounded-full bg-mp-primary px-3 py-1 text-body-sm text-white">
              {totalNaoLidas} não {totalNaoLidas === 1 ? "lida" : "lidas"}
            </span>
          ) : null
        }
      />

      <div className="flex min-h-0 flex-1 gap-4">
        {/* Coluna da lista */}
        <aside className="flex w-[340px] shrink-0 flex-col gap-3 rounded-lg border border-neutral-200 bg-white p-3">
          <div className="relative">
            <MagnifyingGlass
              size={16}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
            />
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por telefone ou texto"
              aria-label="Buscar conversa"
              className="pl-9"
            />
          </div>

          <div className="flex gap-2">
            {(
              [
                ["todas", "Todas"],
                ["nao-lidas", "Não lidas"],
                ["assumidas", "Assumidas"],
              ] as const
            ).map(([valor, rotulo]) => (
              <Button
                key={valor}
                type="button"
                size="sm"
                aria-pressed={filtro === valor}
                variant={filtro === valor ? "primary" : "secondary"}
                onClick={() => setFiltro(valor)}
              >
                {rotulo}
              </Button>
            ))}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {lista.isLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : visiveis.length === 0 ? (
              <EmptyState
                icon={<ChatCircleDots size={28} />}
                title={busca || filtro !== "todas" ? "Nada com esse recorte" : "Nenhuma conversa ainda"}
                description={
                  busca || filtro !== "todas"
                    ? "Tente outro termo ou limpe o filtro."
                    : "Quando alguém escrever para a Mia no WhatsApp, a conversa aparece aqui."
                }
              />
            ) : (
              <ul className="flex flex-col">
                {visiveis.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => abrir(c)}
                      aria-label={`Conversa com ${rotuloDoTelefone(c.telefone)}`}
                      aria-current={aberta === c.id}
                      className={`w-full rounded-sm px-3 py-2 text-left transition-colors hover:bg-neutral-50 ${
                        aberta === c.id ? "bg-neutral-100" : ""
                      }`}
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <span
                          className={`text-body-md ${naoLida(c) ? "font-semibold text-ink" : "text-body"}`}
                        >
                          {rotuloDoTelefone(c.telefone)}
                        </span>
                        <span className="shrink-0 text-body-sm text-muted">
                          {quando(c.ultima_em)}
                        </span>
                      </div>
                      <p className="line-clamp-1 text-body-sm text-muted">
                        {c.ultimo_texto || "sem mensagem"}
                      </p>
                      {c.assumida_por ? (
                        <span className="text-body-sm text-mp-indigo">Assumida pela equipe</span>
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>

        {/* Coluna da conversa */}
        <section className="flex min-w-0 flex-1 flex-col rounded-lg border border-neutral-200 bg-white">
          {!aberta ? (
            <div className="flex flex-1 items-center justify-center">
              <EmptyState
                icon={<ChatCircleDots size={28} />}
                title="Escolha uma conversa"
                description="A lista ao lado mostra quem falou com a Mia."
              />
            </div>
          ) : (
            <>
              <header className="flex items-center justify-between border-b border-neutral-200 px-4 py-3">
                <div>
                  <p className="text-title-md text-ink">
                    {rotuloDoTelefone(conversa.data?.telefone ?? "")}
                  </p>
                  <p className="text-body-sm text-muted">
                    {conversa.data?.assumidaPor
                      ? "Assumida pela equipe: a Mia está em silêncio"
                      : "A Mia está respondendo"}
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={marcar.isPending}
                  onClick={() =>
                    marcar.mutate(
                      { threadId: aberta, lida: false },
                      {
                        onSuccess: () => toast.success("Marcada como não lida."),
                        onError: (e) =>
                          toast.error(e instanceof Error ? e.message : "Não consegui marcar."),
                      },
                    )
                  }
                >
                  {marcar.isPending ? <Envelope size={16} /> : <EnvelopeOpen size={16} />}
                  Marcar não lida
                </Button>
              </header>

              <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
                {conversa.isLoading ? (
                  <Skeleton className="h-40 w-full" />
                ) : (conversa.data?.falas ?? []).length === 0 ? (
                  <EmptyState title="Conversa sem mensagens" />
                ) : (
                  conversa.data?.falas.map((f, i) => (
                    <Bubble key={i} role={f.papel === "cliente" ? "user" : "model"} text={f.texto} />
                  ))
                )}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
