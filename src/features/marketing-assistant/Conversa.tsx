import * as React from "react";
import { PaperPlaneRight, Sparkle } from "@phosphor-icons/react";
import { useChat } from "@ai-sdk/react";
import type { UIMessage } from "ai";
import { MarkdownRestrito } from "@/components/shared/MarkdownRestrito";
import { Button } from "@/components/ui/button";
import { criarTransporte } from "./api";
import { houveGravacao, organizarMensagem, type Proposta } from "./conversa.logic";
import { PassosDoAgente } from "./partes/PassosDoAgente";
import { VisualDaTool } from "./partes/VisualDaTool";

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

function Avatar() {
  return (
    <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-mp-primary/10 text-mp-primary">
      <Sparkle size={14} weight="fill" />
    </span>
  );
}

function Mensagem({ m, propostas }: { m: UIMessage; propostas: Proposta[] }) {
  if (m.role === "user") {
    const texto = m.parts.map((p) => (p.type === "text" ? p.text : "")).join("");
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-mp-primary px-4 py-2.5 text-body-sm text-white">
          {texto}
        </div>
      </div>
    );
  }
  const { passos, textos, destaques } = organizarMensagem(m.parts as never);
  return (
    <div className="flex gap-3">
      <Avatar />
      <div className="min-w-0 flex-1 space-y-3">
        <PassosDoAgente passos={passos} propostas={propostas} />
        {textos.map((t, i) => (
          <MarkdownRestrito key={i} markdown={t} className="space-y-3 text-body-sm leading-relaxed text-body" />
        ))}
        {destaques.map((d, i) => (
          <VisualDaTool key={d.id || i} parte={d} propostas={propostas} />
        ))}
      </div>
    </div>
  );
}

/** A conversa: mensagens, o trabalho do agente recolhido e a caixa de texto. O turno é do AI SDK. */
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
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl space-y-8 px-1 pb-6 pt-2">
          {messages.length === 0 ? (
            <div className="mx-auto mt-16 max-w-md space-y-5 text-center">
              <span className="mx-auto flex size-10 items-center justify-center rounded-full bg-mp-primary/10 text-mp-primary">
                <Sparkle size={20} weight="fill" />
              </span>
              <p className="text-pretty text-body-md text-ink">
                Peça em uma frase. Eu consulto a base e deixo tudo pronto para você revisar.
              </p>
              <div className="flex flex-col gap-2">
                {SUGESTOES.map((s) => (
                  <Button key={s} variant="outline" className="h-auto whitespace-normal py-2.5" onClick={() => enviar(s)}>
                    {s}
                  </Button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((m) => <Mensagem key={m.id} m={m} propostas={propostas} />)
          )}
          {status === "submitted" ? (
            <div className="flex gap-3">
              <Avatar />
              <p className="pt-1 text-body-sm text-muted">Pensando…</p>
            </div>
          ) : null}
          {status === "error" || error ? (
            <p className="text-body-sm text-error">A resposta parou no meio. Tente de novo.</p>
          ) : null}
          <div ref={fim} />
        </div>
      </div>

      <div className="mx-auto w-full max-w-3xl px-1 pt-2">
        <form
          className="flex items-end gap-2 rounded-2xl border border-hairline bg-surface p-2 shadow-sm focus-within:border-mp-primary"
          onSubmit={(e) => {
            e.preventDefault();
            enviar(texto);
          }}
        >
          <textarea
            aria-label="Mensagem para o assistente"
            placeholder="O que você quer montar?"
            value={texto}
            rows={2}
            maxLength={4000}
            className="max-h-40 min-h-[2.75rem] flex-1 resize-none bg-transparent px-2 py-1.5 text-body-sm text-ink outline-none placeholder:text-muted"
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                enviar(texto);
              }
            }}
          />
          <Button type="submit" size="sm" aria-label="Enviar" disabled={ocupado || !texto.trim()} className="rounded-xl">
            <PaperPlaneRight size={16} weight="fill" />
          </Button>
        </form>
        <p className="py-2 text-center text-caption-sm text-muted">
          O que ele grava fica na auditoria. Executar campanha e ligar o disparo pedem o seu clique.
        </p>
      </div>
    </section>
  );
}
