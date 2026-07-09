import { useMemo } from "react";
import DOMPurify from "dompurify";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useLegalDocument } from "./api";
import { LEGAL_SANITIZE_CONFIG, LEGAL_PROSE_CLASS } from "./legalRender";

type Props = {
  slug: string;
  /** Título de fallback (o real vem do banco). */
  title: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/**
 * Documento legal (Termos/Privacidade) em modal — pra ler sem sair do fluxo
 * (ex.: checkout). Mesmo conteúdo e sanitização da página cheia.
 */
export function LegalDocumentModal({ slug, title, open, onOpenChange }: Props) {
  const { data, isLoading } = useLegalDocument(slug);
  const safeHtml = useMemo(
    () => (data?.content ? DOMPurify.sanitize(data.content, LEGAL_SANITIZE_CONFIG) : ""),
    [data?.content],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{data?.title ?? title}</DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : data ? (
          <div
            className={LEGAL_PROSE_CLASS}
            // Sanitizado (DOMPurify + allowlist compartilhada) — não confia no schema client-side.
            dangerouslySetInnerHTML={{ __html: safeHtml }}
          />
        ) : (
          <p className="text-body-md text-muted">Documento indisponível no momento.</p>
        )}
      </DialogContent>
    </Dialog>
  );
}
