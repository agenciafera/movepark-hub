import { useParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { ChatCircleDots } from "@phosphor-icons/react";
import { Bubble } from "@/features/assistant/ChatBubble";
import { EmptyState } from "@/components/shared/EmptyState";
import { Skeleton } from "@/components/ui/skeleton";
import { Anexo } from "@/features/inbox/Anexo";
import { useConversaPublica } from "@/features/inbox/api";
import { textoDaFala } from "@/features/inbox/inbox.logic";

/**
 * Uma conversa aberta por link, para leitura.
 *
 * Serve para mandar a alguém de fora do painel dar uma olhada. Quem abre não tem conta,
 * então o token da URL é a única credencial, e por isso ele é sorteado no servidor com
 * 64 caracteres e morre no instante em que a equipe para de compartilhar.
 *
 * ## O que a página deliberadamente não faz
 *
 * Não mostra o telefone inteiro do cliente (só os quatro últimos), não deixa responder e
 * não abre caminho para outra conversa. E vai com `noindex`: link compartilhado é para
 * quem recebeu, não para quem pesquisa.
 *
 * Fora do `ConsumerAppShell` de propósito: a página não é do site, é uma folha de leitura
 * que alguém recebeu. Menu e rodapé aqui convidariam a navegar para onde a pessoa não
 * tem o que fazer.
 */
export default function ConversaPublica() {
  const { token = "" } = useParams();
  const conversa = useConversaPublica(token);

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[720px] flex-col gap-4 px-4 py-8">
      <Helmet>
        <title>Conversa · Movepark</title>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>

      <header>
        <p className="text-display-xl text-ink">Conversa</p>
        <p className="text-body-md text-body">
          {conversa.data
            ? `Atendimento no WhatsApp com o cliente ${conversa.data.telefone}.`
            : "Somente leitura."}
        </p>
      </header>

      <main className="flex flex-col gap-3 rounded-lg border border-neutral-200 bg-white p-4">
        {conversa.isPending ? (
          <Skeleton className="h-64 w-full" />
        ) : conversa.isError ? (
          <EmptyState
            icon={<ChatCircleDots size={28} />}
            title="Este link não está mais válido"
            description="Quem compartilhou pode ter desativado o acesso. Peça um link novo."
          />
        ) : (conversa.data?.falas ?? []).length === 0 ? (
          <EmptyState title="Conversa sem mensagens" />
        ) : (
          conversa.data?.falas.map((f, i) => (
            <div
              key={f.id || i}
              className={`flex flex-col gap-1 ${f.papel === "cliente" ? "items-end" : "items-start"}`}
            >
              {f.texto ? (
                <Bubble role={f.papel === "cliente" ? "user" : "model"} text={textoDaFala(f.texto)} />
              ) : null}
              {(f.anexos ?? []).map((a) => (
                <Anexo key={a.parte} threadId={null} messageId={f.id} anexo={a} token={token} />
              ))}
            </div>
          ))
        )}
      </main>

      <p className="text-body-sm text-muted">
        Página de leitura compartilhada pela equipe da Movepark. Não é possível responder por aqui.
      </p>
    </div>
  );
}
