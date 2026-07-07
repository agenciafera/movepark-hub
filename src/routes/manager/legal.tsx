import * as React from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { RichTextEditor } from "@/features/legal/RichTextEditor";
import {
  useLegalDocument,
  useLegalDocumentVersions,
  usePublishLegalDocument,
} from "@/features/legal/api";

const DOCS = [
  { slug: "terms", label: "Termos de Uso" },
  { slug: "privacy", label: "Política de Privacidade" },
] as const;

function fmt(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export default function ManagerLegal() {
  const [slug, setSlug] = React.useState<string>("terms");
  const docQ = useLegalDocument(slug);
  const versionsQ = useLegalDocumentVersions(slug);
  const publish = usePublishLegalDocument();
  const [draft, setDraft] = React.useState("");

  React.useEffect(() => {
    if (docQ.data) setDraft(docQ.data.content);
  }, [docQ.data]);

  async function onPublish() {
    if (!draft.trim()) {
      toast.error("O conteúdo não pode ficar vazio.");
      return;
    }
    try {
      await publish.mutateAsync({ slug, content: draft });
      toast.success("Nova versão publicada");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao publicar");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Documentos legais"
        description="Edite os Termos de Uso e a Política de Privacidade. Cada publicação cria uma nova versão."
      />

      <div className="flex gap-2">
        {DOCS.map((d) => (
          <button
            key={d.slug}
            type="button"
            onClick={() => setSlug(d.slug)}
            className={cn(
              "rounded-md border border-hairline px-3 py-1.5 text-body-sm transition-colors",
              slug === d.slug ? "border-mp-indigo bg-mp-indigo/10 text-mp-indigo" : "text-muted hover:bg-surface-hover",
            )}
          >
            {d.label}
          </button>
        ))}
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>{DOCS.find((d) => d.slug === slug)?.label}</CardTitle>
          {docQ.data && (
            <span className="text-caption text-muted">
              Versão atual: v{docQ.data.version} · {fmt(docQ.data.published_at)}
            </span>
          )}
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {docQ.isLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : (
            <RichTextEditor
              key={`${slug}-${docQ.data?.version ?? 0}`}
              initialContent={docQ.data?.content ?? ""}
              onChange={setDraft}
            />
          )}
          <div className="flex items-center gap-3">
            <Button onClick={onPublish} disabled={publish.isPending || docQ.isLoading}>
              {publish.isPending ? "Publicando…" : "Publicar nova versão"}
            </Button>
            <span className="text-caption text-muted">
              A versão publicada aparece imediatamente na página pública.
            </span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Histórico de versões</CardTitle>
        </CardHeader>
        <CardContent>
          {versionsQ.isLoading ? (
            <Skeleton className="h-16 w-full" />
          ) : versionsQ.data && versionsQ.data.length > 0 ? (
            <ul className="divide-y divide-hairline">
              {versionsQ.data.map((v) => (
                <li key={v.id} className="flex items-center justify-between py-2 text-body-sm">
                  <span className="text-ink">
                    v{v.version}
                    {docQ.data?.version === v.version && (
                      <span className="ml-2 rounded bg-mp-indigo/10 px-1.5 py-0.5 text-caption text-mp-indigo">
                        atual
                      </span>
                    )}
                  </span>
                  <span className="text-muted">{fmt(v.published_at)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-body-sm text-muted">Sem versões ainda.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
