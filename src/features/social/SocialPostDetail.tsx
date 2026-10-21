import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  useApproveSocialPost,
  useRejectSocialPost,
  useRescheduleSocialPost,
  useSocialPostEvents,
  useUpdateSocialCaption,
} from "./api";
import {
  dataNoFuturo,
  deCampoDeData,
  formatarDia,
  formatarQuando,
  mensagemDoErro,
  partirGancho,
  podeAprovar,
  REAGENDAVEIS,
  ROTULO_EVENTO,
  ROTULO_STATUS,
  sugestaoDeData,
} from "./social.logic";
import { PreviaFeed } from "./previa/PreviaFeed";
import { PreviaGrade } from "./previa/PreviaGrade";
import { PreviaStories } from "./previa/PreviaStories";
import type { SocialPost } from "@/types/domain";

/**
 * Um post da fila do Instagram: os slides como vão sair (e, em abas, a prévia no feed, nos stories
 * e na grade do perfil), a legenda com o trecho que aparece antes do "mais", a conferência, a
 * agenda, a decisão e o rastro. A imagem não se edita aqui: trocar a arte é refazer o post na
 * skill e reenviar. As prévias são só visuais: nada vai para a Meta e nada é gravado.
 *
 * `fila` é a fila inteira que a página já carregou; a grade do perfil usa dela os outros posts.
 *
 * O estado do que está sendo digitado (legenda em edição, data, motivo) mora em `Corpo`, que
 * recebe `key={post.id}`: trocar de post zera tudo, e recarregar o mesmo post não apaga o que
 * a pessoa estava escrevendo.
 */
export function SocialPostDetail({
  post,
  onClose,
  fila,
}: {
  post: SocialPost | null;
  onClose: () => void;
  fila?: SocialPost[];
}) {
  if (!post) return null;
  return <Corpo key={post.id} post={post} onClose={onClose} fila={fila} />;
}

function Corpo({
  post,
  onClose,
  fila,
}: {
  post: SocialPost;
  onClose: () => void;
  fila?: SocialPost[];
}) {
  const eventos = useSocialPostEvents(post.id);
  const aprovar = useApproveSocialPost();
  const recusar = useRejectSocialPost();
  const reagendar = useRescheduleSocialPost();
  const corrigir = useUpdateSocialCaption();
  const [quando, setQuando] = React.useState(() => sugestaoDeData(post.scheduled_at, new Date()));
  const [legenda, setLegenda] = React.useState(post.caption);
  const [editando, setEditando] = React.useState(false);
  const [motivo, setMotivo] = React.useState("");

  const agora = new Date();
  const aprovacao = podeAprovar(post, agora);
  const dataValida = dataNoFuturo(quando, agora);
  const { gancho, resto } = partirGancho(post.caption);
  const reagendavel = REAGENDAVEIS.includes(post.status);
  const editavel = post.status === "pending_review" || post.status === "approved";

  async function executar(acao: () => Promise<unknown>, sucesso: string) {
    try {
      await acao();
      toast.success(sucesso);
    } catch (e) {
      toast.error(mensagemDoErro(e));
    }
  }

  return (
    <Dialog open onOpenChange={(aberto) => !aberto && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {ROTULO_STATUS[post.status]} · {formatarQuando(post.scheduled_at)}
          </DialogTitle>
          <DialogDescription>
            Origem: {post.draft_key}
            {post.cut_number !== null ? ` · Corte ${post.cut_number}` : ""}
            {post.keyphrase ? ` · Frase-chave: ${post.keyphrase}` : ""}
            {post.price_date ? ` · Preços conferidos em ${formatarDia(post.price_date)}` : ""}
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="slides">
          <TabsList aria-label="Como o post aparece" className="max-w-full overflow-x-auto">
            <TabsTrigger value="slides">Slides</TabsTrigger>
            <TabsTrigger value="feed">Feed</TabsTrigger>
            <TabsTrigger value="stories">Stories</TabsTrigger>
            <TabsTrigger value="grade">Grade do perfil</TabsTrigger>
          </TabsList>
          <TabsContent value="slides">
            <section aria-label="Slides" className="flex gap-3 overflow-x-auto pb-2">
              {post.slides.map((s, i) => (
                <figure key={s.path} className="w-40 shrink-0">
                  <img
                    src={s.url}
                    alt={s.alt ?? ""}
                    className="aspect-[4/5] w-full rounded object-cover"
                  />
                  <figcaption className="mt-1 text-xs text-muted">
                    {i + 1}. {s.alt ?? "Sem texto alternativo"}
                  </figcaption>
                </figure>
              ))}
            </section>
          </TabsContent>
          <TabsContent value="feed">
            <PreviaFeed post={post} />
          </TabsContent>
          <TabsContent value="stories">
            <PreviaStories post={post} />
          </TabsContent>
          <TabsContent value="grade">
            <PreviaGrade post={post} fila={fila} />
          </TabsContent>
        </Tabs>

        <section aria-label="Legenda" className="space-y-2">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="font-semibold">Legenda</h3>
            <span className="text-xs text-muted">{post.caption.length} de 2.200 caracteres</span>
          </div>
          {editando ? (
            <>
              <Textarea
                value={legenda}
                onChange={(e) => setLegenda(e.target.value)}
                rows={10}
                aria-label="Legenda do post"
              />
              <div className="flex gap-2">
                <Button
                  disabled={corrigir.isPending}
                  onClick={() =>
                    executar(async () => {
                      await corrigir.mutateAsync({
                        id: post.id,
                        caption: legenda,
                        expected_updated_at: post.updated_at,
                      });
                      setEditando(false);
                    }, "Legenda salva e conferida de novo. O post fica aguardando aprovação.")
                  }
                >
                  Salvar legenda
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setLegenda(post.caption);
                    setEditando(false);
                  }}
                >
                  Cancelar
                </Button>
              </div>
            </>
          ) : (
            <p className="whitespace-pre-wrap rounded border border-hairline p-3 text-sm">
              <mark data-testid="gancho" className="bg-mp-primary/10 text-ink">
                {gancho}
              </mark>
              {resto}
            </p>
          )}
          {!editando && editavel && (
            <Button
              variant="ghost"
              onClick={() => {
                // O editor abre com a legenda de agora, não com a do primeiro render: se ela mudou
                // enquanto o post estava aberto, corrigir em cima da velha desfaria a mudança.
                setLegenda(post.caption);
                setEditando(true);
              }}
            >
              Corrigir legenda
            </Button>
          )}
        </section>

        {(post.validation.blockers.length > 0 || post.validation.warnings.length > 0) && (
          <section aria-label="Conferência" className="space-y-1 text-sm">
            {post.validation.blockers.map((b) => (
              <p key={b} className="text-error">
                Bloqueio: {b}
              </p>
            ))}
            {post.validation.warnings.map((w) => (
              <p key={w} className="text-muted">
                Atenção: {w}
              </p>
            ))}
          </section>
        )}

        {post.last_error && <p className="text-sm text-error">Último erro: {post.last_error}</p>}
        {post.ig_permalink && (
          <a
            href={post.ig_permalink}
            target="_blank"
            rel="noreferrer"
            className="text-sm text-mp-primary underline"
          >
            Ver o post no Instagram
          </a>
        )}

        {reagendavel && (
          <section aria-label="Agenda" className="flex flex-wrap items-end gap-2">
            <div>
              <Label htmlFor="social-quando">Data e hora (São Paulo)</Label>
              <Input
                id="social-quando"
                type="datetime-local"
                value={quando}
                onChange={(e) => setQuando(e.target.value)}
                aria-describedby={dataValida ? undefined : "social-quando-dica"}
              />
            </div>
            <Button
              variant="secondary"
              disabled={!dataValida || reagendar.isPending}
              onClick={() =>
                executar(
                  () => reagendar.mutateAsync({ p_id: post.id, p_at: deCampoDeData(quando) }),
                  "Post reagendado",
                )
              }
            >
              {post.status === "failed" ? "Tentar de novo" : "Reagendar"}
            </Button>
            {!dataValida && (
              <p id="social-quando-dica" className="basis-full text-sm text-muted">
                Escolha uma data no futuro.
              </p>
            )}
          </section>
        )}

        {post.status === "pending_review" && (
          <section aria-label="Aprovação" className="space-y-2">
            {!aprovacao.ok && <p className="text-sm text-muted">{aprovacao.motivo}</p>}
            <Button
              disabled={!aprovacao.ok || aprovar.isPending}
              onClick={() =>
                executar(
                  () =>
                    aprovar.mutateAsync({
                      p_id: post.id,
                      p_expected_updated_at: post.updated_at,
                    }),
                  "Post aprovado",
                )
              }
            >
              Aprovar
            </Button>
          </section>
        )}

        {reagendavel && (
          <section aria-label="Recusa" className="flex flex-wrap items-end gap-2">
            <div className="min-w-60 flex-1">
              <Label htmlFor="social-motivo">Motivo da recusa</Label>
              <Input
                id="social-motivo"
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
              />
            </div>
            <Button
              variant="danger"
              disabled={!motivo.trim() || recusar.isPending}
              onClick={() =>
                executar(async () => {
                  await recusar.mutateAsync({ p_id: post.id, p_reason: motivo.trim() });
                  onClose();
                }, "Post recusado")
              }
            >
              Recusar
            </Button>
          </section>
        )}

        <section aria-label="Rastro" className="space-y-1">
          <h3 className="font-semibold">Rastro</h3>
          {(eventos.data ?? []).map((ev) => (
            <details key={ev.id} className="rounded border border-hairline p-2 text-xs">
              <summary>
                {formatarQuando(ev.created_at)} · {ROTULO_EVENTO[ev.kind] ?? ev.kind}
                {ev.http_status ? ` · HTTP ${ev.http_status}` : ""}
                {ev.note ? ` · ${ev.note}` : ""}
              </summary>
              <pre className="mt-2 overflow-x-auto whitespace-pre-wrap">
                {JSON.stringify({ request: ev.request, response: ev.response }, null, 2)}
              </pre>
            </details>
          ))}
        </section>
      </DialogContent>
    </Dialog>
  );
}
