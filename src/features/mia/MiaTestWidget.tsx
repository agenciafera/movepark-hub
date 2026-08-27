import * as React from "react";
import { Robot, PaperPlaneTilt, X, Trash } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/auth/context";
import { Bubble } from "@/features/assistant/ChatBubble";
import { appendMessage, canSend, type ChatMessage } from "@/features/assistant/chat.logic";
import {
  ORIGENS_DA_MIA,
  useEnviarParaMia,
  useHistoricoDaMia,
  useLimparConversaDaMia,
  type IdentidadeSimulada,
  type OrigemDaMia,
} from "./api";
import { identidadeDe, rotuloDoTelefone, telefoneAceito } from "./MiaTestWidget.logic";

/**
 * Bolinha de teste da Mia, dentro do Backoffice.
 *
 * É ferramenta de time, não produto: serve para conversar com o agente de WhatsApp
 * sem precisar de um número real e sem passar pela Evolution. Por isso ela é
 * explícita em dizer que é teste, em vez de imitar a experiência do cliente.
 *
 * Só aparece para `hub_admin`. A conversa passa pela Edge `mia-chat`, que confere o
 * papel no servidor e guarda o token do Mastra: o navegador nunca fala com o BeastBots
 * direto.
 *
 * ## A identidade vem antes da conversa
 *
 * Quem abre escolhe o telefone e a origem, e só então começa. É o contrário de um chat
 * de produto, e de propósito: o telefone é o que a Mia usa como prova de posse para
 * achar reserva (D43), então ele não é preferência, é premissa. Pedir depois deixaria a
 * primeira metade da conversa acontecendo com uma identidade e a segunda com outra.
 *
 * O navegador escolhe, mas não monta: quem monta o `requestContext` é a Edge, que confere
 * o formato e a origem contra lista fechada, e que nunca reusa o namespace de memória do
 * WhatsApp de verdade. Ver o cabeçalho de `supabase/functions/mia-chat/index.ts`.
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
   * debug com a fala do agente, e numa ferramenta de teste isso engana, porque o
   * que você lê deixa de ser o que o cliente leria.
   */
  const [toolsPorMensagem, setToolsPorMensagem] = React.useState<Record<number, string[]>>({});
  const [input, setInput] = React.useState("");
  const [erro, setErro] = React.useState<string | null>(null);
  const fim = React.useRef<HTMLDivElement>(null);

  /** `null` enquanto a identidade não foi escolhida: é a tela de antes de começar. */
  const [identidade, setIdentidade] = React.useState<IdentidadeSimulada | null>(null);
  const [telefoneDigitado, setTelefoneDigitado] = React.useState("");
  const [origemEscolhida, setOrigemEscolhida] = React.useState<OrigemDaMia>("webchat-bot");

  // A memória é por usuário para dois testadores não dividirem a mesma conversa.
  const enviar = useEnviarParaMia();
  const limpar = useLimparConversaDaMia();
  const historico = useHistoricoDaMia();

  React.useEffect(() => {
    fim.current?.scrollIntoView({ block: "end" });
  }, [messages, enviar.isPending]);

  if (effectiveRole !== "hub_admin") return null;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSend(input, enviar.isPending)) return;

    if (!identidade) return;

    const texto = input.trim();
    const comPergunta = appendMessage(messages, "user", texto);
    setMessages(comPergunta);
    setInput("");
    setErro(null);

    try {
      // Só o texto novo: a memória do lado do agente é quem sabe o histórico. Ver o
      // comentário em `api.ts` sobre a conversa que ia em dobro.
      const r = await enviar.mutateAsync({ texto, identidade });
      setMessages((atual) => {
        // A saudação do canal entra ANTES da resposta, na ordem em que o cliente leria.
        const comSaudacao = r.blocos.reduce(
          (lista, bloco) => appendMessage(lista, "model", bloco),
          atual,
        );
        const proximo = appendMessage(comSaudacao, "model", r.reply);
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
          <p className="text-body-sm text-muted">
            {identidade
              ? `${rotuloDoTelefone(identidade.telefone)} · ${rotuloDaOrigem(identidade.origem)}`
              : "Teste interno"}
          </p>
        </div>
        <div className="flex items-center gap-1">
          {/*
            Limpar apaga a thread NO SERVIDOR, e não só a tela: senão a Mia continuaria
            lembrando de tudo e o botão viraria mentira. O `/limpar` do WhatsApp faz a
            mesma coisa por comando digitado; aqui a interface tem botão.
          */}
          <button
            type="button"
            onClick={() => {
              setErro(null);
              if (!identidade) return;
              limpar.mutate(identidade, {
                onSuccess: () => {
                  setMessages([]);
                  setToolsPorMensagem({});
                },
                onError: (e) => setErro(e instanceof Error ? e.message : "Não consegui limpar."),
              });
            }}
            /*
              NÃO depende de `messages.length`. A tela começa vazia a cada carregamento,
              mas a conversa vive no servidor: com a checagem antiga, quem recarregava a
              página encontrava o botão apagado justamente quando havia o que limpar.
            */
            disabled={!identidade || limpar.isPending || enviar.isPending}
            aria-label="Limpar conversa"
            title="Apaga esta conversa de teste, aqui e na memória da Mia"
            className="rounded-sm p-1 text-muted hover:text-ink disabled:opacity-40"
          >
            <Trash size={18} />
          </button>
          <button type="button" onClick={() => setOpen(false)} aria-label="Fechar" className="rounded-sm p-1 text-muted hover:text-ink">
            <X size={20} />
          </button>
        </div>
      </header>

      {!identidade ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!telefoneAceito(telefoneDigitado)) return;
            const escolhida = identidadeDe(telefoneDigitado, origemEscolhida);
            setIdentidade(escolhida);
            setErro(null);
            /*
              Abre onde a conversa parou. O agente já lembra (a memória é do servidor);
              sem isto, só a tela fingia que não.
            */
            historico.mutate(escolhida, {
              onSuccess: (falas) =>
                /*
                  O `id` é da tela, e não do servidor: ele existe para o React ter chave
                  estável, e uma conversa carregada nunca se mistura com outra porque
                  trocar de número recarrega a lista inteira.
                */
                setMessages(falas.map((f, i) => ({ id: `historico-${i}`, ...f }))),
              onError: (e) =>
                setErro(e instanceof Error ? e.message : "Não consegui carregar a conversa anterior."),
            });
          }}
          className="flex-1 space-y-4 overflow-y-auto px-4 py-4"
        >
          <div>
            <p className="text-title-md text-ink">Quem a Mia vai atender</p>
            <p className="text-body-sm text-muted">
              Ela usa o telefone para achar a reserva, do mesmo jeito que faz no WhatsApp.
            </p>
          </div>

          <label className="block space-y-1">
            <span className="text-body-sm text-body">Telefone do cliente</span>
            <input
              value={telefoneDigitado}
              onChange={(e) => setTelefoneDigitado(e.target.value)}
              inputMode="tel"
              placeholder="(41) 98814-9449"
              aria-label="Telefone do cliente"
              className="h-11 w-full rounded-sm border border-neutral-200 px-3 text-body-md outline-none focus:border-mp-primary"
            />
            <span className="block text-body-sm text-muted">
              {telefoneAceito(telefoneDigitado)
                ? "Deixe em branco para conversar sem nenhum cliente."
                : "Faltou dígito. Use DDD e número, como (41) 98814-9449."}
            </span>
          </label>

          <label className="block space-y-1">
            <span className="text-body-sm text-body">Origem</span>
            <select
              value={origemEscolhida}
              onChange={(e) => setOrigemEscolhida(e.target.value as OrigemDaMia)}
              aria-label="Origem"
              className="h-11 w-full rounded-sm border border-neutral-200 px-3 text-body-md outline-none focus:border-mp-primary"
            >
              {ORIGENS_DA_MIA.map((o) => (
                <option key={o.valor} value={o.valor}>
                  {o.rotulo}
                </option>
              ))}
            </select>
            <span className="block text-body-sm text-muted">
              É o canal que a reserva registra no sistema do parceiro.
            </span>
          </label>

          <Button type="submit" disabled={!telefoneAceito(telefoneDigitado)} className="w-full">
            Começar conversa
          </Button>
        </form>
      ) : (
      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {messages.length === 0 ? (
          <p className="text-body-sm text-muted">
            Escreva como se fosse o cliente. Cada resposta mostra quais ferramentas a Mia chamou.
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
        {historico.isPending ? (
          <p className="text-body-sm text-muted">Carregando a conversa deste número…</p>
        ) : null}
        {enviar.isPending ? <p className="text-body-sm text-muted">Mia está pensando…</p> : null}
        {limpar.isPending ? <p className="text-body-sm text-muted">Limpando…</p> : null}
        {erro ? (
          <p className="rounded-sm bg-red-50 px-3 py-2 text-body-sm text-red-700">
            {erro}
          </p>
        ) : null}
        <div ref={fim} />
      </div>
      )}

      {identidade ? (
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
      ) : null}
    </div>
  );
}

/** O rótulo curto da origem, para o cabeçalho. */
function rotuloDaOrigem(origem: OrigemDaMia): string {
  return origem === "whatsapp-bot" ? "WhatsApp" : "Webchat";
}
