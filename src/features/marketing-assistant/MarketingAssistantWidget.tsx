import * as React from "react";
import { useLocation } from "react-router-dom";
import { ArrowCounterClockwise, ChatCircleDots, PaperPlaneTilt, X } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Bubble } from "@/features/assistant/ChatBubble";
import { useConfirmarProposta, useConversar } from "./api";
import {
  type Cartao,
  carregarConversa,
  type Conversa,
  type Fala,
  linhasDoCartao,
  paginaDoCaminho,
  resumoDoResultado,
  rotuloDaFerramenta,
  salvarConversa,
  ultimasMensagens,
} from "./marketingAssistant.logic";

/**
 * O assistente da Automação: a bolinha das telas de marketing do Manager.
 *
 * Monta segmento, campanha e cupom pelas tools de marketing (a Edge grava com o admin como ator
 * na auditoria). Executar campanha e mexer na chave geral do disparo chegam como cartão, com o
 * público e o estado da chave, e só rodam no clique em Confirmar. A conversa fica na sessão do
 * navegador, para sobreviver à troca entre Segmentos, Campanhas e Cupons.
 * Ver docs/specs/assistente-marketing.md.
 */

const SUGESTOES = [
  "Quem comprou e sumiu há mais de 90 dias?",
  "Monta uma campanha de volta com cupom de 10%",
  "Como foi o funil nos últimos 30 dias?",
];

let seq = 0;
const novoId = () => `${Date.now().toString(36)}-${++seq}`;

function cartaoDePerigo(c: Cartao): boolean {
  if (c.tool === "marketing_run_campaign") return c.resumo?.disparo_ligado === true;
  if (c.tool === "marketing_set_dispatch_enabled") return c.resumo?.ligar === true;
  return false;
}

export function MarketingAssistantWidget() {
  const { pathname } = useLocation();
  const [aberto, setAberto] = React.useState(false);
  const [conversa, setConversa] = React.useState<Conversa>(() =>
    typeof window === "undefined" ? { falas: [], cartoes: {} } : carregarConversa(),
  );
  const [entrada, setEntrada] = React.useState("");
  const [erro, setErro] = React.useState<string | null>(null);
  const fim = React.useRef<HTMLDivElement>(null);

  const conversar = useConversar();
  const confirmar = useConfirmarProposta();

  React.useEffect(() => {
    salvarConversa(conversa);
  }, [conversa]);

  React.useEffect(() => {
    fim.current?.scrollIntoView?.({ block: "end" });
  }, [conversa.falas, conversar.isPending]);

  if (!pathname.startsWith("/manager/marketing")) return null;

  async function perguntar(texto: string) {
    const mensagem = texto.trim();
    if (!mensagem || conversar.isPending) return;
    setErro(null);
    setEntrada("");
    const doUsuario: Fala = { id: novoId(), papel: "usuario", texto: mensagem, ferramentas: [], cartaoIds: [] };
    const falas = [...conversa.falas, doUsuario];
    setConversa((c) => ({ ...c, falas: [...c.falas, doUsuario] }));
    try {
      const r = await conversar.mutateAsync({
        mensagens: ultimasMensagens(falas),
        pagina: paginaDoCaminho(pathname),
      });
      const novos: Cartao[] = (r.propostas ?? []).map((p) => ({ ...p, id: novoId(), status: "aberta" }));
      const resposta: Fala = {
        id: novoId(),
        papel: "assistente",
        texto: r.resposta,
        ferramentas: r.ferramentas ?? [],
        cartaoIds: novos.map((n) => n.id),
      };
      setConversa((c) => ({
        falas: [...c.falas, resposta],
        cartoes: { ...c.cartoes, ...Object.fromEntries(novos.map((n) => [n.id, n])) },
      }));
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não consegui falar com o assistente agora.");
    }
  }

  function mudarCartao(id: string, mudanca: Partial<Cartao>) {
    setConversa((c) => ({ ...c, cartoes: { ...c.cartoes, [id]: { ...c.cartoes[id], ...mudanca } } }));
  }

  async function onConfirmar(c: Cartao) {
    mudarCartao(c.id, { status: "executando" });
    try {
      const r = await confirmar.mutateAsync({ tool: c.tool, args: c.args });
      mudarCartao(c.id, { status: "feita", resultado: resumoDoResultado(c.tool, r.resultado) });
    } catch (e) {
      mudarCartao(c.id, {
        status: "falhou",
        resultado: e instanceof Error ? e.message : "Não consegui executar agora.",
      });
    }
  }

  if (!aberto) {
    return (
      <button
        type="button"
        onClick={() => setAberto(true)}
        aria-label="Abrir o assistente da Automação"
        className="fixed bottom-20 right-4 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-mp-indigo text-white shadow-lg transition-colors hover:bg-mp-primary tablet:bottom-6 tablet:right-6"
      >
        <ChatCircleDots size={26} weight="fill" />
      </button>
    );
  }

  const vazia = conversa.falas.length === 0;

  return (
    <div
      className="fixed inset-x-2 bottom-20 z-50 flex h-[min(640px,calc(100vh-6rem))] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-neutral-200 tablet:inset-x-auto tablet:bottom-6 tablet:right-6 tablet:w-[420px]"
      data-testid="marketing-assistant"
    >
      <header className="flex items-center justify-between border-b border-neutral-200 px-4 py-3">
        <div>
          <p className="text-title-md text-ink">Assistente</p>
          <p className="text-body-sm text-muted">Automação de marketing</p>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => {
              setConversa({ falas: [], cartoes: {} });
              setErro(null);
            }}
            disabled={conversar.isPending}
            aria-label="Começar outra conversa"
            title="Começar outra conversa"
            className="rounded-sm p-1 text-muted hover:text-ink disabled:opacity-40"
          >
            <ArrowCounterClockwise size={18} />
          </button>
          <button
            type="button"
            onClick={() => setAberto(false)}
            aria-label="Fechar"
            className="rounded-sm p-1 text-muted hover:text-ink"
          >
            <X size={20} />
          </button>
        </div>
      </header>

      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
        <p className="text-caption text-muted">
          O que ele grava fica na auditoria. Executar campanha e ligar o disparo pedem o seu clique.
        </p>

        {vazia ? (
          <div className="space-y-2">
            <p className="text-body-sm text-body">
              Peça em uma frase. Eu consulto a base e deixo tudo pronto para você revisar.
            </p>
            {SUGESTOES.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => void perguntar(s)}
                className="block w-full rounded-md border border-neutral-200 px-3 py-2 text-left text-body-sm text-ink hover:border-mp-primary"
              >
                {s}
              </button>
            ))}
          </div>
        ) : null}

        {conversa.falas.map((f) => (
          <React.Fragment key={f.id}>
            {f.papel === "assistente" && f.ferramentas.length > 0 ? (
              <ul className="flex flex-wrap gap-1" aria-label="O que o assistente consultou">
                {f.ferramentas.map((t, i) => (
                  <li
                    key={`${t.nome}-${i}`}
                    className={
                      "rounded-full px-2 py-0.5 text-caption " +
                      (t.ok ? "bg-neutral-100 text-muted" : "bg-red-50 text-red-700")
                    }
                  >
                    {rotuloDaFerramenta(t.nome, t.ok)}
                  </li>
                ))}
              </ul>
            ) : null}
            <Bubble role={f.papel === "usuario" ? "user" : "model"} text={f.texto} />
            {f.cartaoIds.map((id) =>
              conversa.cartoes[id] ? (
                <CartaoDaProposta
                  key={id}
                  cartao={conversa.cartoes[id]}
                  onConfirmar={onConfirmar}
                  onDescartar={(c) => mudarCartao(c.id, { status: "descartada" })}
                />
              ) : null,
            )}
          </React.Fragment>
        ))}

        {conversar.isPending ? <p className="text-body-sm text-muted">Consultando a base…</p> : null}
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
          placeholder="O que você quer montar?"
          aria-label="Mensagem para o assistente"
          maxLength={4000}
          className="h-11 flex-1 rounded-sm border border-neutral-200 px-3 text-body-md outline-none focus:border-mp-primary"
        />
        <Button type="submit" size="icon" disabled={!entrada.trim() || conversar.isPending} aria-label="Enviar">
          <PaperPlaneTilt size={18} />
        </Button>
      </form>
    </div>
  );
}

function CartaoDaProposta({
  cartao,
  onConfirmar,
  onDescartar,
}: {
  cartao: Cartao;
  onConfirmar: (c: Cartao) => void;
  onDescartar: (c: Cartao) => void;
}) {
  const { titulo, linhas, podeConfirmar } = linhasDoCartao(cartao);
  const perigo = cartaoDePerigo(cartao);
  return (
    <div
      className={
        "ml-1 space-y-2 rounded-xl border bg-white p-3 " + (perigo ? "border-amber-400" : "border-neutral-200")
      }
      data-testid="cartao-proposta"
    >
      <p className="text-body-sm font-semibold text-ink">{titulo}</p>
      {linhas.map((l) => (
        <p key={l} className="text-body-sm text-body">
          {l}
        </p>
      ))}
      {cartao.status === "aberta" ? (
        <div className="flex gap-2">
          {podeConfirmar ? (
            <Button size="sm" onClick={() => onConfirmar(cartao)}>
              Confirmar
            </Button>
          ) : null}
          <Button size="sm" variant="outline" onClick={() => onDescartar(cartao)}>
            Descartar
          </Button>
        </div>
      ) : cartao.status === "executando" ? (
        <p className="text-body-sm text-muted">Executando…</p>
      ) : cartao.status === "descartada" ? (
        <p className="text-body-sm text-muted">Descartado.</p>
      ) : cartao.status === "falhou" ? (
        <p className="text-body-sm text-red-700">Não deu: {cartao.resultado}</p>
      ) : (
        <p className="text-body-sm font-medium text-ink">{cartao.resultado}</p>
      )}
    </div>
  );
}
