import * as React from "react";
import { PaperPlaneRight, Sparkle } from "@phosphor-icons/react";
import { useChat } from "@ai-sdk/react";
import type { UIMessage } from "ai";
import { MarkdownRestrito } from "@/components/shared/MarkdownRestrito";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { criarTransporte } from "./api";
import { houveGravacao, parteDeTool, type Proposta } from "./conversa.logic";
import { ParteDaTool } from "./partes/ParteDaTool";

const SUGESTOES = [
  "Monta um segmento de quem não reserva há mais de 90 dias",
  "Como está a base por grupo de RFM?",
  "Escreve uma campanha de volta para quem sumiu",
];

type Props = {
  conversaId: string;
  inicial: UIMessage[];
  propostas: Proposta[];
  onTurnoTerminou: (gravou: boolean) => void;
};

function Mensagem({ m, propostas }: { m: UIMessage; propostas: Proposta[] }) {
  if (m.role === "user") {
    const texto = m.parts.map((p) => (p.type === "text" ? p.text : "")).join("");
    return (
      <div className="ml-auto max-w-[85%] whitespace-pre-wrap rounded-2xl bg-mp-primary px-4 py-2 text-body-sm text-white">
        {texto}
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {m.parts.map((p, i) => {
        if (p.type === "text") return <MarkdownRestrito key={i} markdown={p.text} className="text-body-sm text-body" />;
        const tool = parteDeTool(p as never);
        return tool ? <ParteDaTool key={tool.id || i} parte={tool} propostas={propostas} /> : null;
      })}
    </div>
  );
}

/** A conversa: mensagens, o que cada tool fez e a caixa de texto. O estado do turno é do AI SDK. */
export function Conversa({ conversaId, inicial, propostas, onTurnoTerminou }: Props) {
  const transporte = React.useMemo(() => criarTransporte(conversaId), [conversaId]);
  const { messages, sendMessage, status, error } = useChat({
    id: conversaId,
    messages: inicial,
    transport: transporte,
    onFinish: ({ message }) => onTurnoTerminou(houveGravacao(message as never)),
  });
  const [texto, setTexto] = React.useState("");
  const fim = React.useRef<HTMLDivElement>(null);
  const ocupado = status === "submitted" || status === "streaming";

  React.useEffect(() => {
    fim.current?.scrollIntoView?.({ block: "end" });
  }, [messages, status]);

  const enviar = (t: string) => {
    const v = t.trim();
    if (!v || ocupado) return;
    void sendMessage({ text: v });
    setTexto("");
  };

  return (
    <section className="flex min-h-0 flex-1 flex-col">
      <div className="flex-1 space-y-6 overflow-y-auto pb-4">
        {messages.length === 0 ? (
          <div className="mx-auto mt-10 max-w-xl space-y-4 text-center">
            <Sparkle size={28} className="mx-auto text-mp-primary" />
            <p className="text-pretty text-body-md text-ink">
              Peça em uma frase. Eu consulto a base e deixo tudo pronto para você revisar.
            </p>
            <div className="flex flex-col gap-2">
              {SUGESTOES.map((s) => (
                <Button key={s} variant="outline" className="h-auto whitespace-normal py-2" onClick={() => enviar(s)}>
                  {s}
                </Button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m) => <Mensagem key={m.id} m={m} propostas={propostas} />)
        )}
        {status === "submitted" ? <p className="text-body-sm text-muted">Pensando…</p> : null}
        {status === "error" || error ? (
          <p className="text-body-sm text-error">A resposta parou no meio. Tente de novo.</p>
        ) : null}
        <div ref={fim} />
      </div>

      <p className="pb-2 text-caption-sm text-muted">
        O que ele grava fica na auditoria. Executar campanha e ligar o disparo pedem o seu clique.
      </p>
      <form
        className="flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          enviar(texto);
        }}
      >
        <Textarea
          aria-label="Mensagem para o assistente"
          placeholder="O que você quer montar?"
          value={texto}
          rows={2}
          maxLength={4000}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              enviar(texto);
            }
          }}
        />
        <Button type="submit" aria-label="Enviar" disabled={ocupado || !texto.trim()}>
          <PaperPlaneRight size={18} />
        </Button>
      </form>
    </section>
  );
}
