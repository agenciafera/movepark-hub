import * as React from "react";
import { Robot, PaperPlaneTilt, X } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/auth/context";
import { Bubble } from "@/features/assistant/ChatBubble";
import { appendMessage, canSend, type ChatMessage } from "@/features/assistant/chat.logic";
import { useEnviarParaMia } from "./api";

/**
 * Bolinha de teste da Mia, dentro do Backoffice.
 *
 * É ferramenta de time, não produto: serve para conversar com o agente de WhatsApp
 * sem precisar de um número real e sem passar pela Evolution. Por isso ela é
 * explícita em dizer que é teste, em vez de imitar a experiência do cliente.
 *
 * Só aparece para `hub_admin`. A conversa passa pela Edge `mia-chat`, que confere o
 * papel no servidor e guarda o token do Mastra: o navegador nunca fala com o BeastBots
 * direto, e nunca escolhe de quem é o telefone da conversa.
 */
export function MiaTestWidget() {
  const { effectiveRole } = useAuth();
  const [open, setOpen] = React.useState(false);
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  /**
   * As tools ficam FORA do texto, indexadas pela mensagem.
   *
   * A primeira versão concatenava `_tools: ..._` na própria resposta. Além de sair
   * com underscore literal (o renderizador só entende negrito), isso misturava
   * debug com a fala do agente — e numa ferramenta de teste isso engana, porque o
   * que você lê deixa de ser o que o cliente leria.
   */
  const [toolsPorMensagem, setToolsPorMensagem] = React.useState<Record<number, string[]>>({});
  const [input, setInput] = React.useState("");
  const [erro, setErro] = React.useState<string | null>(null);
  const fim = React.useRef<HTMLDivElement>(null);

  // A memória é por usuário para dois testadores não dividirem a mesma conversa.
  const enviar = useEnviarParaMia();

  React.useEffect(() => {
    fim.current?.scrollIntoView({ block: "end" });
  }, [messages, enviar.isPending]);

  if (effectiveRole !== "hub_admin") return null;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSend(input, enviar.isPending)) return;

    const texto = input.trim();
    const comPergunta = appendMessage(messages, "user", texto);
    setMessages(comPergunta);
    setInput("");
    setErro(null);

    try {
      const r = await enviar.mutateAsync(
        comPergunta.map((m) => ({ role: m.role, text: m.text })),
      );
      setMessages((atual) => {
        const proximo = appendMessage(atual, "model", r.reply);
        if (r.tools.length) {
          setToolsPorMensagem((t) => ({ ...t, [proximo.length - 1]: r.tools }));
        }
        return proximo;
      });
    } catch (cause) {
      setErro(cause instanceof Error ? cause.message : String(cause));
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Testar a Mia"
        className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-mp-indigo text-white shadow-lg transition-colors hover:bg-mp-primary"
      >
        <Robot size={26} />
      </button>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 flex h-[560px] w-[380px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-neutral-200">
      <header className="flex items-center justify-between border-b border-neutral-200 px-4 py-3">
        <div>
          <p className="text-title-md text-ink">Mia</p>
          {/* Quem está testando precisa saber que não é o bot do cliente. */}
          <p className="text-body-sm text-muted">Teste interno, com identidade fictícia</p>
        </div>
        <button type="button" onClick={() => setOpen(false)} aria-label="Fechar" className="text-muted hover:text-ink">
          <X size={20} />
        </button>
      </header>

      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {messages.length === 0 ? (
          <p className="text-body-sm text-muted">
            Converse com o agente de WhatsApp sem precisar de um número. As respostas mostram quais
            ferramentas ele chamou.
          </p>
        ) : null}
        {messages.map((m, i) => (
          <React.Fragment key={i}>
            <Bubble role={m.role} text={m.text} />
            {toolsPorMensagem[i]?.length ? (
              <p className="pl-1 text-body-sm text-muted">
                chamou: {toolsPorMensagem[i].join(", ")}
              </p>
            ) : null}
          </React.Fragment>
        ))}
        {enviar.isPending ? <p className="text-body-sm text-muted">Mia está pensando…</p> : null}
        {erro ? (
          <p className="rounded-sm bg-red-50 px-3 py-2 text-body-sm text-red-700">
            {erro}
          </p>
        ) : null}
        <div ref={fim} />
      </div>

      <form onSubmit={onSubmit} className="flex items-center gap-2 border-t border-neutral-200 p-3">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Escreva como se fosse o cliente…"
          className="h-11 flex-1 rounded-sm border border-neutral-200 px-3 text-body-md outline-none focus:border-mp-primary"
        />
        <Button type="submit" size="icon" disabled={!canSend(input, enviar.isPending)} aria-label="Enviar">
          <PaperPlaneTilt size={18} />
        </Button>
      </form>
    </div>
  );
}
