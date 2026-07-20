import * as React from "react";
import { Link, useLocation } from "react-router-dom";
import { MessageCircle, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/auth/context";
import { useChatConfig, useSendChat } from "./api";
import { appendMessage, canSend, toRequestMessages, type ChatMessage } from "./chat.logic";

const GREETING =
  "Oi! Sou o assistente da Movepark. Posso buscar estacionamento, simular preço, tirar dúvidas e, se você estiver logado, reservar ou cancelar. Como posso ajudar?";

/** Bolinha de chat (assistente web do Hub, E3.3). Some quando `chatbot_enabled=false`. */
export function ChatWidget() {
  const cfg = useChatConfig();
  const send = useSendChat();
  const { session } = useAuth();
  const location = useLocation();
  const [open, setOpen] = React.useState(false);
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [input, setInput] = React.useState("");
  const [needsLogin, setNeedsLogin] = React.useState(false);
  const listRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages, open]);

  if (!cfg.data?.enabled) return null;

  // Só mostra o botão se o assistente pediu login E o usuário de fato não está logado.
  const showLogin = needsLogin && !session;
  const loginHref = `/login?next=${encodeURIComponent(location.pathname + location.search)}`;

  async function handleSend() {
    const text = input.trim();
    if (!canSend(text, send.isPending)) return;
    const next = appendMessage(messages, "user", text);
    setMessages(next);
    setInput("");
    try {
      const res = await send.mutateAsync(toRequestMessages(next));
      setMessages((m) => appendMessage(m, "model", res.reply));
      setNeedsLogin(!!res.login_required);
    } catch (e) {
      setMessages((m) => appendMessage(m, "model", `Desculpe, deu um erro: ${(e as Error).message}`));
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        aria-label="Abrir assistente"
        onClick={() => setOpen(true)}
        className="fixed bottom-20 right-4 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-mp-primary text-white shadow-lg transition hover:bg-mp-primary-active tablet:bottom-6 tablet:right-6"
      >
        <MessageCircle className="h-6 w-6" />
      </button>
    );
  }

  return (
    <div className="fixed bottom-20 right-4 z-50 flex h-[480px] w-[calc(100vw-2rem)] max-w-[380px] flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-xl tablet:bottom-6 tablet:right-6">
      <header className="flex items-center justify-between bg-mp-primary px-4 py-3 text-white">
        <span className="text-button-sm font-semibold">Assistente Movepark</span>
        <button type="button" aria-label="Fechar assistente" onClick={() => setOpen(false)}>
          <X className="h-5 w-5" />
        </button>
      </header>

      <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        <Bubble role="model" text={GREETING} />
        {messages.map((m) => (
          <Bubble key={m.id} role={m.role} text={m.text} />
        ))}
        {send.isPending && <Bubble role="model" text="…" />}
        {showLogin && (
          <div className="flex justify-start">
            <Button asChild size="sm" onClick={() => setNeedsLogin(false)}>
              <Link to={loginHref}>Entrar para reservar</Link>
            </Button>
          </div>
        )}
      </div>

      <form
        className="flex items-center gap-2 border-t border-neutral-200 p-3"
        onSubmit={(e) => {
          e.preventDefault();
          void handleSend();
        }}
      >
        <input
          aria-label="Mensagem"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Escreva sua mensagem…"
          className="h-10 flex-1 rounded-md border border-neutral-200 px-3 text-body-sm outline-none focus:border-mp-primary"
        />
        <Button type="submit" size="icon" disabled={!canSend(input, send.isPending)} aria-label="Enviar">
          <Send className="h-4 w-4" />
        </Button>
      </form>
    </div>
  );
}

function Bubble({ role, text }: { role: "user" | "model"; text: string }) {
  const mine = role === "user";
  return (
    <div className={mine ? "flex justify-end" : "flex justify-start"}>
      <div
        className={
          "max-w-[80%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-body-sm " +
          (mine ? "bg-mp-primary text-white" : "bg-neutral-100 text-neutral-900")
        }
      >
        {text}
      </div>
    </div>
  );
}
