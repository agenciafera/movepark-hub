import * as React from "react";
import { toast } from "sonner";
import { Copy, Warning } from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/shared/EmptyState";
import { derivarPostsSociais, type SocialDraft } from "./social.logic";
import type { BlogPostWithDestination } from "@/types/domain";

/**
 * Os quatro recortes de rede social de um post, prontos para copiar.
 *
 * A tela é de conferência, não de edição: o recorte sai do artigo (ver
 * `social.logic.ts`), então corrigir um card é corrigir o artigo, que é onde o
 * texto ranqueia. Editar aqui criaria uma segunda versão do mesmo número, e
 * ninguém saberia qual foi ao ar.
 */
export function SocialDraftsDialog({
  open,
  onOpenChange,
  post,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  post: BlogPostWithDestination | null;
}) {
  const derivacao = React.useMemo(
    () =>
      post
        ? derivarPostsSociais({
            title: post.title,
            slug: post.slug,
            bodyMd: post.body_md,
            destinationName: post.destination?.name ?? null,
            destinationShortName: post.destination?.short_name ?? null,
            destinationSlug: post.destination?.slug ?? null,
          })
        : null,
    [post],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Posts para redes</DialogTitle>
          <DialogDescription>
            Recortes do artigo "{post?.title}". Todo número sai de uma tabela do texto, com a data
            que o artigo declara. A ordem abaixo é a sequência sugerida de publicação ao longo da
            semana.
          </DialogDescription>
        </DialogHeader>

        {!derivacao ? null : derivacao.drafts.length === 0 ? (
          <EmptyState title="Este artigo não sustenta nenhum recorte." />
        ) : (
          <div className="flex flex-col gap-6">
            {derivacao.drafts.map((draft, i) => (
              <DraftCard
                key={draft.format}
                draft={draft}
                posicao={i + 1}
                total={derivacao.drafts.length}
              />
            ))}
          </div>
        )}

        {derivacao?.gaps.length ? (
          <div className="rounded-lg border border-hairline bg-surface-soft p-4">
            <p className="text-title-sm text-ink">O que o artigo não sustenta</p>
            <ul className="mt-2 flex flex-col gap-1">
              {derivacao.gaps.map((gap) => (
                <li key={gap.format} className="text-body-sm text-muted">
                  {gap.reason}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function DraftCard({
  draft,
  posicao,
  total,
}: {
  draft: SocialDraft;
  posicao: number;
  total: number;
}) {
  const bloqueado = draft.blockers.length > 0;

  async function copiar() {
    try {
      await navigator.clipboard.writeText(draft.caption);
      toast.success("Legenda copiada");
    } catch {
      toast.error("Não foi possível copiar. Selecione o texto e copie à mão.");
    }
  }

  return (
    <section className="rounded-lg border border-hairline p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-title-sm text-ink">
            {posicao} de {total}. {draft.label}
          </h3>
          <p className="text-caption-sm text-muted">{draft.source}</p>
        </div>
        <div className="flex items-center gap-2">
          {draft.priceDate ? <Badge tone="neutral">Preço de {draft.priceDate}</Badge> : null}
          <Button variant="outline" size="sm" onClick={copiar} disabled={bloqueado}>
            <Copy className="h-4 w-4" /> Copiar legenda
          </Button>
        </div>
      </div>

      {bloqueado ? (
        <ul className="mt-3 flex flex-col gap-1 rounded-lg border border-error bg-badge-cancelled-bg p-3">
          {draft.blockers.map((b) => (
            <li key={b} className="flex gap-2 text-body-sm text-error">
              <Warning className="mt-0.5 h-4 w-4 shrink-0" weight="fill" />
              {b}
            </li>
          ))}
        </ul>
      ) : null}

      {draft.warnings.length ? (
        <ul className="mt-3 flex flex-col gap-1">
          {draft.warnings.map((w) => (
            <li key={w} className="text-caption-sm text-muted">
              {w}
            </li>
          ))}
        </ul>
      ) : null}

      <ol className="sm:grid-cols-3 mt-4 grid gap-3">
        {draft.cards.map((card, i) => (
          <li
            key={`${card.title}-${i}`}
            className="flex aspect-square flex-col justify-center gap-1 rounded-lg bg-surface-soft p-3"
          >
            {card.eyebrow ? (
              <span className="text-caption-sm text-muted">{card.eyebrow}</span>
            ) : null}
            <span className="text-title-sm text-ink">{card.title}</span>
            {card.body ? <span className="text-caption-sm text-body">{card.body}</span> : null}
          </li>
        ))}
      </ol>

      <p className="mt-4 whitespace-pre-line rounded-lg bg-surface-soft p-3 text-body-sm text-body">
        {draft.caption}
      </p>
      <p className="mt-2 text-caption-sm text-muted">Texto alternativo: {draft.alt}</p>
    </section>
  );
}
