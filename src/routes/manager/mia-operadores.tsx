import * as React from "react";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Bubble } from "@/features/assistant/ChatBubble";
import {
  type ArtigoInput,
  useArquivarArtigo,
  useArtigosDaBase,
  useConversasDosOperadores,
  useLacunas,
  useResolverLacuna,
  useSalvarArtigo,
} from "@/features/operator-assistant/managerApi";
import { agruparConversas, erroDoArtigo, type FalaGravada, slugDoTitulo } from "@/features/operator-assistant/managerAssistant.logic";
import { formatDateTime } from "@/lib/format";
import type { OperatorPlaybookArticle } from "@/types/domain";

/**
 * Manager › Mia para operadores (17/11/2026): o que os operadores perguntam, o que a Mia não
 * soube responder e a base que ela consulta. Ver docs/specs/assistente-do-operador.md.
 */
export default function ManagerMiaOperadores() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Mia para operadores"
        description="A assistente do painel do estacionamento. Aqui ficam as conversas, as perguntas que ela não soube responder e a base que ela consulta."
      />
      <Tabs defaultValue="lacunas">
        <TabsList>
          <TabsTrigger value="lacunas">Sem resposta</TabsTrigger>
          <TabsTrigger value="conversas">Conversas</TabsTrigger>
          <TabsTrigger value="base">Base do operador</TabsTrigger>
        </TabsList>
        <TabsContent value="lacunas">
          <Lacunas />
        </TabsContent>
        <TabsContent value="conversas">
          <Conversas />
        </TabsContent>
        <TabsContent value="base">
          <Base />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Lacunas() {
  const [status, setStatus] = React.useState<"open" | "resolved" | "ignored">("open");
  const lista = useLacunas(status);
  const resolver = useResolverLacuna();

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {(["open", "resolved", "ignored"] as const).map((s) => (
          <Button key={s} size="sm" variant={status === s ? "primary" : "outline"} onClick={() => setStatus(s)}>
            {s === "open" ? "Abertas" : s === "resolved" ? "Resolvidas" : "Ignoradas"}
          </Button>
        ))}
      </div>
      {lista.isLoading ? <p className="text-body-sm text-muted">Carregando…</p> : null}
      {lista.data?.length === 0 ? (
        <p className="text-body-sm text-muted">
          {status === "open" ? "Nenhuma pergunta sem resposta. A base está cobrindo o que os operadores perguntam." : "Nada aqui."}
        </p>
      ) : null}
      <div className="space-y-3">
        {(lista.data ?? []).map((g) => (
          <div key={g.id} className="space-y-2 rounded-md border border-hairline bg-white p-4">
            <p className="text-body-md font-medium text-ink">{g.question}</p>
            {g.context ? <p className="text-body-sm text-body">{g.context}</p> : null}
            <p className="text-caption text-muted">
              {g.company?.name ?? "Empresa"} · {g.profile?.full_name ?? "Sem nome"} · {formatDateTime(g.created_at)}
              {g.booking_code ? ` · ${g.booking_code}` : ""}
            </p>
            {g.resolution_note ? <p className="text-body-sm text-muted">Nota: {g.resolution_note}</p> : null}
            {status === "open" ? (
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={() => resolver.mutate({ id: g.id, status: "resolved", nota: "Base atualizada.", articleId: null })}
                  disabled={resolver.isPending}
                >
                  Base atualizada
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => resolver.mutate({ id: g.id, status: "ignored", nota: null, articleId: null })}
                  disabled={resolver.isPending}
                >
                  Ignorar
                </Button>
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function Conversas() {
  const lista = useConversasDosOperadores(null);
  const conversas = React.useMemo(() => agruparConversas((lista.data ?? []) as unknown as FalaGravada[]), [lista.data]);
  const [aberta, setAberta] = React.useState<string | null>(null);

  if (lista.isLoading) return <p className="text-body-sm text-muted">Carregando…</p>;
  if (!conversas.length) return <p className="text-body-sm text-muted">Nenhuma conversa ainda.</p>;

  return (
    <div className="space-y-2">
      {conversas.map((c) => (
        <div key={c.id} className="rounded-md border border-hairline bg-white">
          <button
            type="button"
            onClick={() => setAberta(aberta === c.id ? null : c.id)}
            className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
          >
            <div>
              <p className="text-body-md font-medium text-ink">
                {c.empresa} · {c.pessoa}
              </p>
              <p className="text-caption text-muted">
                {c.perguntas} {c.perguntas === 1 ? "pergunta" : "perguntas"} · {formatDateTime(c.ultimaEm)}
                {c.comErro ? " · teve erro" : ""}
              </p>
            </div>
            <span className="text-caption text-mp-primary">{aberta === c.id ? "Fechar" : "Abrir"}</span>
          </button>
          {aberta === c.id ? (
            <div className="space-y-3 border-t border-hairline px-4 py-3">
              {c.falas.map((f) =>
                f.role === "system" ? (
                  <p key={f.id} className="text-center text-caption text-muted">
                    {f.content}
                  </p>
                ) : f.error ? (
                  <p key={f.id} className="rounded-sm bg-red-50 px-3 py-2 text-body-sm text-red-700">
                    A Mia não respondeu: {f.error}
                  </p>
                ) : (
                  <div key={f.id} className="space-y-1">
                    <Bubble role={f.role === "user" ? "user" : "model"} text={f.content} />
                    {f.used_tools?.length ? <p className="pl-1 text-caption text-muted">consultou: {f.used_tools.join(", ")}</p> : null}
                  </div>
                ),
              )}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

const VAZIO: ArtigoInput = { slug: "", title: "", category: "", body_md: "", is_published: true };

function Base() {
  const lista = useArtigosDaBase();
  const salvar = useSalvarArtigo();
  const arquivar = useArquivarArtigo();
  const [editando, setEditando] = React.useState<ArtigoInput | null>(null);
  const [erro, setErro] = React.useState<string | null>(null);

  const categorias = React.useMemo(
    () => [...new Set((lista.data ?? []).map((a) => a.category))].sort(),
    [lista.data],
  );

  function abrir(a: OperatorPlaybookArticle | null) {
    setErro(null);
    setEditando(
      a ? { id: a.id, slug: a.slug, title: a.title, category: a.category, body_md: a.body_md, is_published: a.is_published } : VAZIO,
    );
  }

  function onSalvar() {
    if (!editando) return;
    const problema = erroDoArtigo(editando);
    if (problema) return setErro(problema);
    salvar.mutate(
      { ...editando, slug: editando.slug || slugDoTitulo(editando.title) },
      { onSuccess: () => setEditando(null), onError: (e) => setErro(e instanceof Error ? e.message : "Não consegui salvar.") },
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-body-sm text-muted">
          A Mia busca nestes artigos antes de responder. Ao salvar, ela passa a usar o texto novo em poucos minutos.
        </p>
        <Button size="sm" onClick={() => abrir(null)}>
          Novo artigo
        </Button>
      </div>
      {lista.isLoading ? <p className="text-body-sm text-muted">Carregando…</p> : null}
      {categorias.map((cat) => (
        <div key={cat} className="space-y-2">
          <p className="text-title-sm text-ink">{cat}</p>
          {(lista.data ?? [])
            .filter((a) => a.category === cat)
            .map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => abrir(a)}
                className="flex w-full items-center justify-between rounded-md border border-hairline bg-white px-4 py-3 text-left hover:border-mp-primary"
              >
                <span className="text-body-md text-ink">{a.title}</span>
                {!a.is_published ? <span className="text-caption text-muted">rascunho</span> : null}
              </button>
            ))}
        </div>
      ))}

      <Dialog open={!!editando} onOpenChange={(o) => !o && setEditando(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editando?.id ? "Editar artigo" : "Novo artigo"}</DialogTitle>
          </DialogHeader>
          {editando ? (
            <div className="space-y-3">
              <label className="block space-y-1">
                <span className="text-body-sm text-body">Título</span>
                <Input value={editando.title} onChange={(e) => setEditando({ ...editando, title: e.target.value })} />
              </label>
              <label className="block space-y-1">
                <span className="text-body-sm text-body">Categoria</span>
                <Input
                  list="categorias-da-base"
                  value={editando.category}
                  onChange={(e) => setEditando({ ...editando, category: e.target.value })}
                />
                <datalist id="categorias-da-base">
                  {categorias.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </label>
              <label className="block space-y-1">
                <span className="text-body-sm text-body">Texto (markdown)</span>
                <Textarea
                  rows={14}
                  value={editando.body_md}
                  onChange={(e) => setEditando({ ...editando, body_md: e.target.value })}
                />
                <span className="block text-caption text-muted">
                  Escreva a regra e, quando ajudar, a mensagem pronta para o cliente numa linha que começa com &gt;.
                </span>
              </label>
              <label className="flex items-center gap-2">
                <Switch checked={editando.is_published} onCheckedChange={(v) => setEditando({ ...editando, is_published: v })} />
                <span className="text-body-sm text-body">Publicado (a Mia usa)</span>
              </label>
              {erro ? <p className="rounded-sm bg-red-50 px-3 py-2 text-body-sm text-red-700">{erro}</p> : null}
            </div>
          ) : null}
          <DialogFooter className="gap-2">
            {editando?.id ? (
              <Button
                variant="outline"
                onClick={() => editando.id && arquivar.mutate(editando.id, { onSuccess: () => setEditando(null) })}
                disabled={arquivar.isPending}
              >
                Arquivar
              </Button>
            ) : null}
            <Button onClick={onSalvar} disabled={salvar.isPending}>
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
