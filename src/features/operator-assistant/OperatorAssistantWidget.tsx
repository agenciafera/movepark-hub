import * as React from "react";
import { useLocation } from "react-router-dom";
import { ArrowCounterClockwise, ChatCircleDots, PaperPlaneTilt, X } from "@phosphor-icons/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/auth/context";
import { Bubble } from "@/features/assistant/ChatBubble";
import {
  novoId,
  useConfirmarAcao,
  useDescartarAcao,
  useEnviarAoAssistente,
  useHistoricoDoAssistente,
  useNovaConversa,
} from "./api";
import {
  type CartaoDeAcao,
  codigoDaPagina,
  type Fala,
  juntarCartoes,
  podeConfirmar,
  rotuloDaAcao,
  rotuloDoEfeito,
  rotuloDoStatus,
  sugestoes,
} from "./operatorAssistant.logic";

/**
 * A Mia para operadores: a bolinha do painel do estacionamento.
 *
 * Ajuda quem atende o cliente a decidir e a responder: lê a reserva, consulta a base do
 * operador, escreve a mensagem pronta (com botão de copiar) e, quando há ação, mostra um cartão
 * com o efeito em reais. Nada acontece sem o "Confirmar" do operador; quem executa é a Edge,
 * pelas mesmas Edges dos botões do painel. Ver docs/specs/assistente-do-operador.md.
 *
 * A empresa é a ativa no painel (ou a impersonada pelo hub_admin). A página aberta vai junto,
 * para "esta reserva" funcionar sem o operador digitar o código.
 */
export function OperatorAssistantWidget() {
  const { scopedCompanyId, effectiveCompanyIds } = useAuth();
  const companyId = scopedCompanyId ?? effectiveCompanyIds[0] ?? null;
  const { pathname } = useLocation();
  const codigo = codigoDaPagina(pathname);

  const [aberto, setAberto] = React.useState(false);
  const [falas, setFalas] = React.useState<Fala[]>([]);
  const [cartoes, setCartoes] = React.useState<Record<string, CartaoDeAcao>>({});
  const [entrada, setEntrada] = React.useState("");
  const [erro, setErro] = React.useState<string | null>(null);
  const fim = React.useRef<HTMLDivElement>(null);

  const historico = useHistoricoDoAssistente(companyId, aberto);
  const enviar = useEnviarAoAssistente();
  const novaConversa = useNovaConversa();
  const confirmar = useConfirmarAcao();
  const descartar = useDescartarAcao();

  // A conversa vive no servidor; ao abrir (ou trocar de empresa), a tela carrega onde parou.
  // Depende do carimbo da busca, e não do objeto: assim só recarrega quando chega dado novo.
  const carregadoEm = historico.dataUpdatedAt;
  React.useEffect(() => {
    if (historico.data) {
      setFalas(historico.data.falas);
      setCartoes(juntarCartoes({}, historico.data.cartoes));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [carregadoEm]);

  React.useEffect(() => {
    fim.current?.scrollIntoView({ block: "end" });
  }, [falas, enviar.isPending]);

  if (!companyId) return null;

  async function perguntar(texto: string) {
    const mensagem = texto.trim();
    if (!mensagem || enviar.isPending || !companyId) return;
    setErro(null);
    setEntrada("");
    setFalas((f) => [...f, { id: novoId(), role: "user", text: mensagem, actionIds: [] }]);
    try {
      const r = await enviar.mutateAsync({ companyId, mensagem, pagina: pathname, bookingCode: codigo });
      setCartoes((c) => juntarCartoes(c, r.actions));
      setFalas((f) => [
        ...f,
        { id: novoId(), role: "assistant", text: r.reply, actionIds: r.actions.map((a) => a.id) },
      ]);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não consegui falar com a Mia agora.");
    }
  }

  function copiar(texto: string) {
    void navigator.clipboard?.writeText(texto).then(
      () => toast.success("Mensagem copiada."),
      () => toast.error("Não consegui copiar. Selecione o texto e copie à mão."),
    );
  }

  async function onConfirmar(c: CartaoDeAcao) {
    setCartoes((m) => ({ ...m, [c.id]: { ...c, status: "executing" } }));
    try {
      const r = await confirmar.mutateAsync(c.id);
      setCartoes((m) => ({
        ...m,
        [c.id]: { ...c, status: r.status, result: { resumo: r.resumo, ...(r.pix ? { pix: r.pix } : {}) } },
      }));
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Não consegui fazer a ação.";
      setCartoes((m) => ({ ...m, [c.id]: { ...c, status: "failed", result: { resumo: msg }, error: msg } }));
    }
  }

  function onDescartar(c: CartaoDeAcao) {
    setCartoes((m) => ({ ...m, [c.id]: { ...c, status: "dismissed" } }));
    descartar.mutate(c.id);
  }

  if (!aberto) {
    return (
      <button
        type="button"
        onClick={() => setAberto(true)}
        aria-label="Abrir a Mia, assistente da operação"
        className="fixed bottom-20 right-4 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-mp-indigo text-white shadow-lg transition-colors hover:bg-mp-primary tablet:bottom-6 tablet:right-6"
      >
        <ChatCircleDots size={26} weight="fill" />
      </button>
    );
  }

  const agora = new Date();
  const vazia = falas.length === 0 && !historico.isLoading;

  return (
    <div
      className="fixed inset-x-2 bottom-20 z-50 flex h-[min(620px,calc(100vh-6rem))] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-neutral-200 tablet:inset-x-auto tablet:bottom-6 tablet:right-6 tablet:w-[400px]"
      data-testid="operator-assistant"
    >
      <header className="flex items-center justify-between border-b border-neutral-200 px-4 py-3">
        <div>
          <p className="text-title-md text-ink">Mia</p>
          <p className="text-body-sm text-muted">Assistente da operação</p>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() =>
              novaConversa.mutate(companyId, {
                onSuccess: () => {
                  setFalas([]);
                  setCartoes({});
                  setErro(null);
                },
                onError: (e) => setErro(e instanceof Error ? e.message : "Não consegui começar outra conversa."),
              })
            }
            disabled={novaConversa.isPending || enviar.isPending}
            aria-label="Nova conversa"
            title="Começa uma conversa nova"
            className="rounded-sm p-1 text-muted hover:text-ink disabled:opacity-40"
          >
            <ArrowCounterClockwise size={18} />
          </button>
          <button type="button" onClick={() => setAberto(false)} aria-label="Fechar" className="rounded-sm p-1 text-muted hover:text-ink">
            <X size={20} />
          </button>
        </div>
      </header>

      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
        <p className="text-caption text-muted">A conversa fica registrada para a equipe Movepark melhorar as respostas.</p>

        {vazia ? (
          <div className="space-y-2">
            <p className="text-body-sm text-body">
              Pergunte sobre uma reserva, um estorno ou uma regra. Eu explico o que fazer e escrevo a mensagem para o cliente.
            </p>
            {sugestoes(codigo).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => perguntar(s)}
                className="block w-full rounded-md border border-neutral-200 px-3 py-2 text-left text-body-sm text-ink hover:border-mp-primary"
              >
                {s}
              </button>
            ))}
          </div>
        ) : null}

        {historico.isLoading ? <p className="text-body-sm text-muted">Carregando a conversa…</p> : null}
        {historico.error ? (
          <p className="rounded-sm bg-red-50 px-3 py-2 text-body-sm text-red-700">
            {historico.error instanceof Error ? historico.error.message : "Não consegui carregar a conversa."}
          </p>
        ) : null}

        {falas.map((f) =>
          f.role === "system" ? (
            <p key={f.id} className="text-center text-caption text-muted">
              {f.text}
            </p>
          ) : (
            <React.Fragment key={f.id}>
              <Bubble role={f.role === "user" ? "user" : "model"} text={f.text} onCopiar={f.role === "assistant" ? copiar : undefined} />
              {f.actionIds.map((id) => (cartoes[id] ? (
                <CartaoDaAcao
                  key={id}
                  cartao={cartoes[id]}
                  agora={agora}
                  onConfirmar={onConfirmar}
                  onDescartar={onDescartar}
                  onCopiar={copiar}
                />
              ) : null))}
            </React.Fragment>
          ),
        )}

        {enviar.isPending ? <p className="text-body-sm text-muted">A Mia está consultando…</p> : null}
        {erro ? <p className="rounded-sm bg-red-50 px-3 py-2 text-body-sm text-red-700">{erro}</p> : null}
        <div ref={fim} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void perguntar(entrada);
        }}
        className="flex items-center gap-2 border-t border-neutral-200 p-3"
      >
        <input
          value={entrada}
          onChange={(e) => setEntrada(e.target.value)}
          placeholder={codigo ? `Pergunte sobre a ${codigo}` : "Pergunte à Mia"}
          aria-label="Mensagem para a Mia"
          maxLength={2000}
          className="h-11 flex-1 rounded-sm border border-neutral-200 px-3 text-body-md outline-none focus:border-mp-primary"
        />
        <Button type="submit" size="icon" disabled={!entrada.trim() || enviar.isPending} aria-label="Enviar">
          <PaperPlaneTilt size={18} />
        </Button>
      </form>
    </div>
  );
}

function CartaoDaAcao({
  cartao,
  agora,
  onConfirmar,
  onDescartar,
  onCopiar,
}: {
  cartao: CartaoDeAcao;
  agora: Date;
  onConfirmar: (c: CartaoDeAcao) => void;
  onDescartar: (c: CartaoDeAcao) => void;
  onCopiar: (texto: string) => void;
}) {
  const status = rotuloDoStatus(cartao, agora);
  const ativo = podeConfirmar(cartao, agora);
  const pix = cartao.result?.pix?.copia_e_cola;
  return (
    <div className="ml-1 space-y-2 rounded-xl border border-neutral-200 bg-white p-3" data-testid="cartao-acao">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-body-sm font-semibold text-ink">{rotuloDaAcao(cartao.kind)}</p>
        {cartao.booking_code ? <p className="text-caption text-muted">{cartao.booking_code}</p> : null}
      </div>
      <p className="text-body-sm text-body">{cartao.summary}</p>
      <p className="text-body-sm font-medium text-ink">{rotuloDoEfeito(cartao.effect_cents)}</p>
      {ativo ? (
        <div className="flex gap-2">
          <Button size="sm" onClick={() => onConfirmar(cartao)}>
            Confirmar
          </Button>
          <Button size="sm" variant="outline" onClick={() => onDescartar(cartao)}>
            Descartar
          </Button>
        </div>
      ) : status ? (
        <p className={"text-body-sm " + (cartao.status === "failed" ? "text-red-700" : "text-muted")}>{status}</p>
      ) : null}
      {pix ? (
        <button type="button" onClick={() => onCopiar(pix)} className="text-caption font-medium text-mp-primary hover:underline">
          Copiar o PIX para mandar ao cliente
        </button>
      ) : null}
    </div>
  );
}
