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

/**
 * `role` decide o LADO e a cor; `markdown` decide como o texto é lido.
 *
 * No widget as duas coisas andam juntas: quem escreve à direita é você, em texto puro,
 * e quem responde à esquerda é o agente, em markdown. Na caixa de entrada elas se
 * separam: quem fica à direita é a **Mia**, e a resposta dela vem em markdown. Sem
 * separar, inverter os lados fazia a Mia aparecer com `**Virapark**` cru na tela.
 */
export function Bubble({
  role,
  text,
  markdown,
}: {
  role: "user" | "model";
  text: string;
  markdown?: boolean;
}) {
  const mine = role === "user";
  const comMarkdown = markdown ?? !mine;
  const blocks = comMarkdown ? parseChatMarkdown(text) : null;
  return (
    <div className={mine ? "flex justify-end" : "flex justify-start"}>
      <div
        className={
          // `break-words` porque a conversa carrega URL de voucher com 130 caracteres,
          // e sem isso ela estoura a bolha e passa por cima do que vem depois.
          "max-w-[80%] break-words rounded-2xl px-3 py-2 text-body-sm " +
          (comMarkdown ? "space-y-2 " : "whitespace-pre-wrap ") +
          (mine ? "bg-mp-primary text-white" : "bg-neutral-100 text-neutral-900")
        }
      >
        {!comMarkdown
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
