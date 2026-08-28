import { parseChatMarkdown, type InlineToken } from "./chat.logic";

/**
 * A bolha de uma mensagem do chat.
 *
 * Saiu de dentro do `ChatWidget` quando o Backoffice ganhou um segundo chat (o de
 * teste da Mia). Duplicar a renderização faria os dois divergirem no primeiro
 * ajuste de estilo, e aí o que a gente testa deixa de parecer com o que o cliente vê.
 */
function Inline({ spans }: { spans: InlineToken[] }) {
  return (
    <>
      {spans.map((s, i) => (s.bold ? <strong key={i}>{s.text}</strong> : <span key={i}>{s.text}</span>))}
    </>
  );
}

export function Bubble({ role, text }: { role: "user" | "model"; text: string }) {
  const mine = role === "user";
  // A resposta do assistente vem em markdown; renderiza negrito e listas. Do usuário é texto puro.
  const blocks = mine ? null : parseChatMarkdown(text);
  return (
    <div className={mine ? "flex justify-end" : "flex justify-start"}>
      <div
        className={
          // `break-words` porque a conversa carrega URL de voucher com 130 caracteres,
          // e sem isso ela estoura a bolha e passa por cima do que vem depois.
          "max-w-[80%] break-words rounded-2xl px-3 py-2 text-body-sm " +
          (mine ? "whitespace-pre-wrap bg-mp-primary text-white" : "space-y-2 bg-neutral-100 text-neutral-900")
        }
      >
        {mine
          ? text
          : blocks!.map((b, i) =>
              b.type === "ul" ? (
                <ul key={i} className="list-disc space-y-1 pl-4">
                  {b.items.map((item, j) => (
                    <li key={j}>
                      <Inline spans={item} />
                    </li>
                  ))}
                </ul>
              ) : (
                <p key={i}>
                  <Inline spans={b.spans} />
                </p>
              ),
            )}
      </div>
    </div>
  );
}
