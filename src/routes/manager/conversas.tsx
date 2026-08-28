import * as React from "react";
import {
  Copy,
  ImageSquare,
  ChatCircleDots,
  MagnifyingGlass,
  Envelope,
  EnvelopeOpen,
  HandPalm,
  Robot,
  PaperPlaneTilt,
  WhatsappLogo,
  Globe,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { Skeleton } from "@/components/ui/skeleton";
import { CarregandoConversa } from "@/features/inbox/CarregandoConversa";
import { conversaEmImagem } from "@/features/inbox/conversaEmImagem";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Bubble } from "@/features/assistant/ChatBubble";
import { Anexo } from "@/features/inbox/Anexo";
import {
  useAssumirConversa,
  useConversa,
  useConversas,
  useDevolverConversa,
  useMarcarConversa,
  useResponderConversa,
  type ConversaDaLista,
} from "@/features/inbox/api";
import {
  filtrar,
  juntarPaginas,
  naoLida,
  quando,
  previa,
  rotuloDoTelefone,
  conversaEmTexto,
  textoDaFala,
  type FiltroDaCaixa,
} from "@/features/inbox/inbox.logic";

/** Salva o PNG quando o navegador não sabe copiar imagem. */
function baixarImagem(png: Blob, telefone: string) {
  const url = URL.createObjectURL(png);
  const a = document.createElement("a");
  a.href = url;
  a.download = `conversa-${telefone.replace(/\D/g, "") || "movepark"}.png`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Caixa de entrada das conversas da Mia.
 *
 * Lista à esquerda, conversa à direita, como todo mundo espera de um painel de
 * atendimento. O Studio do Mastra mostra as mesmas conversas, mas por id cru e sem
 * busca: serve para depurar, não para acompanhar cliente.
 *
 * As conversas vivem no Postgres do BeastBots, outro projeto Supabase, então tudo passa
 * pela Edge `mia-inbox`. Ver `features/inbox/api.ts`.
 */
export default function ManagerConversas() {
  const [busca, setBusca] = React.useState("");

  /**
   * O termo só vai ao servidor quando a pessoa para de digitar.
   *
   * Sem isso, "voucher" dispara sete consultas, uma por letra, e as respostas voltam
   * fora de ordem: a lista pisca com o resultado de "vouch" depois do de "voucher".
   */
  const [termo, setTermo] = React.useState("");
  React.useEffect(() => {
    const t = setTimeout(() => setTermo(busca.trim()), 350);
    return () => clearTimeout(t);
  }, [busca]);
  const [filtro, setFiltro] = React.useState<FiltroDaCaixa>("todas");
  const [aberta, setAberta] = React.useState<string | null>(null);

  const lista = useConversas(true, termo);
  const conversa = useConversa(aberta);
  const marcar = useMarcarConversa();
  const assumir = useAssumirConversa();
  const devolver = useDevolverConversa();
  const responder = useResponderConversa();
  const [resposta, setResposta] = React.useState("");
  const [gerandoImagem, setGerandoImagem] = React.useState(false);
  const fim = React.useRef<HTMLDivElement>(null);

  const assumida = !!conversa.data?.assumidaPor;

  /**
   * Rola para a última mensagem ao abrir e a cada fala nova.
   *
   * Sem isto a conversa abre no começo, e quem está atendendo precisa rolar até o fim
   * para ver o que acabou de chegar. Vi isso na tela antes de qualquer teste pegar.
   */
  React.useEffect(() => {
    fim.current?.scrollIntoView({ block: "end" });
  }, [conversa.data?.falas, aberta]);

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    const texto = resposta.trim();
    if (!texto || !aberta || responder.isPending) return;
    responder.mutate(
      { threadId: aberta, texto },
      {
        onSuccess: () => setResposta(""),
        onError: (err) => toast.error(err instanceof Error ? err.message : "Não consegui enviar."),
      },
    );
  }

  /**
   * A busca acontece no servidor; aqui sobra só o recorte por estado (não lidas,
   * assumidas), que é sobre o que já está na tela.
   */
  const carregadas = React.useMemo(() => juntarPaginas(lista.data?.pages), [lista.data]);

  /**
   * O telefone do cabeçalho sai da LISTA enquanto a conversa carrega.
   *
   * Lendo só a conversa aberta, o cabeçalho dizia "sem número" durante a espera, e um
   * cabeçalho que se corrige sozinho depois de dois segundos faz duvidar de tudo o que
   * está na tela. A lista já sabe o número: foi ela que ofereceu a conversa.
   */
  const linhaAberta = React.useMemo(
    () => carregadas.find((c) => c.id === aberta) ?? null,
    [carregadas, aberta],
  );
  const telefoneDaConversa = conversa.data?.telefone || linhaAberta?.telefone || "";

  const visiveis = React.useMemo(() => filtrar(carregadas, filtro, ""), [carregadas, filtro]);
  const totalNaoLidas = React.useMemo(() => carregadas.filter(naoLida).length, [carregadas]);

  /**
   * Rolagem infinita: uma âncora no fim da lista pede a próxima página ao aparecer.
   *
   * `IntersectionObserver` em vez de escutar `scroll`: ele não roda em toda rolagem e
   * não precisa medir altura, que é onde esse tipo de código costuma errar.
   */
  const ancora = React.useRef<HTMLLIElement>(null);
  React.useEffect(() => {
    const alvo = ancora.current;
    if (!alvo || !lista.hasNextPage) return;
    const obs = new IntersectionObserver((entradas) => {
      if (entradas[0]?.isIntersecting && !lista.isFetchingNextPage) lista.fetchNextPage();
    });
    obs.observe(alvo);
    return () => obs.disconnect();
  }, [lista.hasNextPage, lista.isFetchingNextPage, lista]);

  /**
   * Abrir uma conversa marca como lida.
   *
   * É o que a pessoa espera, e evita o passo manual que ninguém faz. Marcar de volta
   * como não lida continua existindo, no botão do cabeçalho.
   */
  function abrir(c: ConversaDaLista) {
    setAberta(c.id);
    if (naoLida(c)) marcar.mutate({ threadId: c.id, lida: true });
  }

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col gap-4">
      <PageHeader
        title="Conversas"
        description="O que os clientes falam com a Mia no WhatsApp, em tempo quase real."
        actions={
          totalNaoLidas > 0 ? (
            <span className="rounded-full bg-mp-primary px-3 py-1 text-body-sm text-white">
              {totalNaoLidas} não {totalNaoLidas === 1 ? "lida" : "lidas"}
            </span>
          ) : null
        }
      />

      <div className="flex min-h-0 flex-1 gap-4">
        {/* Coluna da lista */}
        <aside className="flex w-[340px] shrink-0 flex-col gap-3 rounded-lg border border-neutral-200 bg-white p-3">
          <div className="relative">
            <MagnifyingGlass
              size={16}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
            />
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por telefone ou por qualquer palavra"
              aria-label="Buscar conversa"
              className="pl-9"
            />
          </div>

          <div className="flex gap-2">
            {(
              [
                ["todas", "Todas"],
                ["nao-lidas", "Não lidas"],
                ["assumidas", "Assumidas"],
              ] as const
            ).map(([valor, rotulo]) => (
              <Button
                key={valor}
                type="button"
                size="sm"
                aria-pressed={filtro === valor}
                variant={filtro === valor ? "primary" : "secondary"}
                onClick={() => setFiltro(valor)}
              >
                {rotulo}
              </Button>
            ))}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {lista.isLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : visiveis.length === 0 ? (
              <EmptyState
                icon={<ChatCircleDots size={28} />}
                title={termo || filtro !== "todas" ? "Nada com esse recorte" : "Nenhuma conversa ainda"}
                description={
                  termo || filtro !== "todas"
                    ? "Tente outro termo ou limpe o filtro."
                    : "Quando alguém escrever para a Mia no WhatsApp, a conversa aparece aqui."
                }
              />
            ) : (
              <ul className="flex flex-col">
                {visiveis.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => abrir(c)}
                      aria-label={`Conversa com ${rotuloDoTelefone(c.telefone)}`}
                      aria-current={aberta === c.id}
                      className={`w-full rounded-sm px-3 py-2 text-left transition-colors hover:bg-neutral-50 ${
                        aberta === c.id ? "bg-neutral-100" : ""
                      }`}
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <span
                          className={`flex items-center gap-1.5 text-body-md ${naoLida(c) ? "font-semibold text-ink" : "text-body"}`}
                        >
                          {/*
                            De onde a conversa veio. A tabela não tem coluna de canal: a
                            origem sai do formato do id, no servidor.
                          */}
                          {c.origem === "webchat" ? (
                            <Globe size={14} className="shrink-0 text-muted" aria-label="Webchat" />
                          ) : (
                            <WhatsappLogo
                              size={14}
                              weight="fill"
                              className="shrink-0 text-emerald-600"
                              aria-label="WhatsApp"
                            />
                          )}
                          {rotuloDoTelefone(c.telefone)}
                        </span>
                        <span className="shrink-0 text-body-sm text-muted">
                          {quando(c.ultima_em)}
                        </span>
                      </div>
                      <p className="line-clamp-1 text-body-sm text-muted">
                        {previa(c.ultimo_texto) || "sem mensagem"}
                      </p>
                      <span className="flex items-center gap-2 text-body-sm">
                        <span className="text-muted">
                          {c.origem === "webchat" ? "Webchat" : "WhatsApp"}
                        </span>
                        {c.assumida_por ? (
                          <span className="text-mp-indigo">Assumida pela equipe</span>
                        ) : null}
                      </span>
                    </button>
                  </li>
                ))}
                <li ref={ancora} className="py-2 text-center text-body-sm text-muted">
                  {lista.isFetchingNextPage
                    ? "Carregando mais…"
                    : lista.hasNextPage
                      ? " "
                      : "Fim da lista."}
                </li>
              </ul>
            )}
          </div>
        </aside>

        {/* Coluna da conversa */}
        <section className="flex min-w-0 flex-1 flex-col rounded-lg border border-neutral-200 bg-white">
          {!aberta ? (
            <div className="flex flex-1 items-center justify-center">
              <EmptyState
                icon={<ChatCircleDots size={28} />}
                title="Escolha uma conversa"
                description="A lista ao lado mostra quem falou com a Mia."
              />
            </div>
          ) : (
            <>
              <header className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-200 px-4 py-3">
                <div className="min-w-0">
                  <p className="whitespace-nowrap text-title-md text-ink">
                    {rotuloDoTelefone(telefoneDaConversa)}
                  </p>
                  <p className="text-body-sm text-muted">
                    {conversa.data?.assumidaPor
                      ? "Assumida pela equipe: a Mia está em silêncio"
                      : "A Mia está respondendo"}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={assumida ? "primary" : "secondary"}
                  disabled={assumir.isPending || devolver.isPending}
                  onClick={() => {
                    const acao = assumida ? devolver : assumir;
                    acao.mutate(
                      { threadId: aberta },
                      {
                        onSuccess: () =>
                          toast.success(
                            assumida
                              ? "Devolvida. A Mia volta a responder."
                              : "Assumida. A Mia não responde mais nesta conversa.",
                          ),
                        onError: (e) =>
                          toast.error(e instanceof Error ? e.message : "Não consegui mudar."),
                      },
                    );
                  }}
                >
                  {assumida ? <Robot size={16} /> : <HandPalm size={16} />}
                  {assumida ? "Devolver" : "Assumir"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={!conversa.data}
                  onClick={() => {
                    const texto = conversaEmTexto(
                      conversa.data?.falas ?? [],
                      telefoneDaConversa,
                    );
                    navigator.clipboard
                      ?.writeText(texto)
                      .then(() => toast.success("Conversa copiada. Já dá para colar."))
                      .catch(() => toast.error("Não consegui copiar. Tente de novo."));
                  }}
                >
                  <Copy size={16} />
                  Copiar conversa
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={!conversa.data || gerandoImagem}
                  onClick={async () => {
                    setGerandoImagem(true);
                    try {
                      const png = await conversaEmImagem(
                        conversa.data?.falas ?? [],
                        telefoneDaConversa,
                      );
                      /*
                        `ClipboardItem` e' o unico jeito de por' imagem na area de
                        transferencia, e nem todo navegador tem. Sem ele a imagem ja'
                        existe: vale mais baixar do que dizer "nao deu".
                      */
                      if (typeof ClipboardItem === "function" && navigator.clipboard?.write) {
                        await navigator.clipboard.write([
                          new ClipboardItem({ "image/png": png }),
                        ]);
                        toast.success("Imagem copiada. Já dá para colar.");
                      } else {
                        baixarImagem(png, telefoneDaConversa);
                        toast.success("Imagem baixada: este navegador não copia imagem.");
                      }
                    } catch (e) {
                      toast.error(
                        e instanceof Error ? e.message : "Não consegui gerar a imagem.",
                      );
                    } finally {
                      setGerandoImagem(false);
                    }
                  }}
                >
                  <ImageSquare size={16} />
                  {gerandoImagem ? "Gerando…" : "Copiar imagem"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={marcar.isPending}
                  onClick={() =>
                    marcar.mutate(
                      { threadId: aberta, lida: false },
                      {
                        onSuccess: () => toast.success("Marcada como não lida."),
                        onError: (e) =>
                          toast.error(e instanceof Error ? e.message : "Não consegui marcar."),
                      },
                    )
                  }
                >
                  {marcar.isPending ? <Envelope size={16} /> : <EnvelopeOpen size={16} />}
                  Não lida
                </Button>
                </div>
              </header>

              <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
                {conversa.isLoading ? (
                  <CarregandoConversa />
                ) : (conversa.data?.falas ?? []).length === 0 ? (
                  <EmptyState title="Conversa sem mensagens" />
                ) : (
                  conversa.data?.falas.map((f, i) => (
                    <div
                      key={f.id || i}
                      /*
                        `items-*` NAO entra aqui: a `Bubble` ja se alinha sozinha, com
                        um `flex justify-end` de largura cheia por dentro. Encolhendo o
                        pai, o `max-w-[80%]` dela passava a ser 80% de quase nada, e a
                        bolha vazava para fora do container. Alinhamento fica so' nos
                        anexos, que nao tem essa mecanica.
                      */
                      className="flex flex-col gap-1"
                    >
                      {/*
                        Quem escreveu, e nao so' de que lado veio.

                        Os dois baloes da esquerda sao a Mia e a equipe, e sem nome eles
                        se confundem: quem abre a conversa amanha nao sabe se aquela
                        frase foi o robo ou um colega. A fala do cliente nao leva
                        assinatura, porque o nome dele ja esta' no topo da tela.
                      */}
                      {f.autor ? (
                        // A assinatura acompanha o balao: a' esquerda ela ficaria orfa,
                        // longe da fala que assina.
                        <span className="self-end text-[11px] text-muted">{f.autor}</span>
                      ) : null}
                      {f.texto ? (
                        <Bubble
                          /*
                        O CLIENTE fica a' esquerda, em cinza; quem atende fica a'
                        direita, em roxo. E' o arranjo do WhatsApp Web, e a caixa de
                        entrada e' lida por quem atende: inverter isso faz a pessoa ler
                        a propria equipe como se fosse o cliente.

                        A `Bubble` chama de "user" o lado direito, porque nasceu na
                        bolinha de teste, onde quem escreve e' voce. Aqui quem escreve
                        e' a Mia ou a equipe, entao o papel do balao e' o oposto do
                        papel na conversa.
                      */
                      role={f.papel === "cliente" ? "model" : "user"}
                          // O markdown segue quem FALA, nao o lado: a Mia responde em
                          // markdown mesmo estando a' direita.
                          markdown={f.papel === "agente"}
                          text={textoDaFala(f.texto)}
                        />
                      ) : null}
                      {/*
                        `?? []` porque um formato inesperado do servidor NAO pode
                        derrubar a tela. Aconteceu: um deploy do backend ficou para tras,
                        a fala veio sem `anexos`, e a pagina inteira virou "Algo deu
                        errado" em vez de mostrar a conversa que ela ja tinha.
                      */}
                      {(f.anexos ?? []).length > 0 ? (
                        <div
                          className={`flex flex-col gap-1 ${f.papel === "cliente" ? "items-start" : "items-end"}`}
                        >
                          {(f.anexos ?? []).map((a) => (
                            <Anexo key={a.parte} threadId={aberta} messageId={f.id} anexo={a} />
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ))
                )}
                <div ref={fim} />
              </div>

              {/*
                A caixa de resposta só aparece com a conversa assumida.
                Responder sem assumir deixaria a Mia e a pessoa falando por cima uma da
                outra, cada uma sem saber da outra.
              */}
              {assumida ? (
                <form
                  onSubmit={enviar}
                  className="flex items-center gap-2 border-t border-neutral-200 p-3"
                >
                  <Input
                    value={resposta}
                    onChange={(e) => setResposta(e.target.value)}
                    placeholder="Escreva para o cliente…"
                    aria-label="Resposta para o cliente"
                    disabled={responder.isPending}
                  />
                  <Button
                    type="submit"
                    size="icon"
                    aria-label="Enviar"
                    disabled={!resposta.trim() || responder.isPending}
                  >
                    <PaperPlaneTilt size={18} />
                  </Button>
                </form>
              ) : (
                <p className="border-t border-neutral-200 px-4 py-3 text-body-sm text-muted">
                  Assuma a conversa para escrever ao cliente. Enquanto isso, a Mia responde.
                </p>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
