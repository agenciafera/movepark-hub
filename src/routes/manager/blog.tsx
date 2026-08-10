import * as React from "react";
import { toast } from "sonner";
import { ArrowSquareOut, Plus } from "@phosphor-icons/react";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAdminBlogPosts, useDeleteBlogPost } from "@/features/blog/api";
import { BlogPostForm } from "@/features/blog/BlogPostForm";
import { BlogTaxonomyDialog } from "@/features/blog/BlogTaxonomyDialog";
import { formatDate } from "@/lib/format";
import type { BlogPostWithDestination } from "@/types/domain";

export default function ManagerBlog() {
  const { data, isLoading } = useAdminBlogPosts();
  const del = useDeleteBlogPost();
  const [editing, setEditing] = React.useState<BlogPostWithDestination | null>(null);
  const [formOpen, setFormOpen] = React.useState(false);
  const [busca, setBusca] = React.useState("");
  const [taxonomiaOpen, setTaxonomiaOpen] = React.useState(false);

  const posts = React.useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return data ?? [];
    return (data ?? []).filter(
      (p) =>
        p.title.toLowerCase().includes(termo) ||
        p.slug.includes(termo) ||
        (p.destination?.name ?? "").toLowerCase().includes(termo) ||
        (p.category?.name ?? "").toLowerCase().includes(termo) ||
        (p.author?.name ?? "").toLowerCase().includes(termo) ||
        p.tags.some((t) => t.name.toLowerCase().includes(termo)),
    );
  }, [data, busca]);

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }
  function openEdit(post: BlogPostWithDestination) {
    setEditing(post);
    setFormOpen(true);
  }
  async function remove(post: BlogPostWithDestination) {
    if (!confirm(`Excluir o post "${post.title}"? A URL /blog/${post.slug}/ passa a dar 404.`)) {
      return;
    }
    try {
      await del.mutateAsync(post.id);
      toast.success("Post excluído");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao excluir");
    }
  }

  const semDestino = (data ?? []).filter((p) => !p.destination_id).length;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Blog"
        description="Posts publicados em /blog/. O slug é a URL que o Google indexou, então mudá-lo quebra tráfego."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => setTaxonomiaOpen(true)}>
              Categorias, tags e autores
            </Button>
            <Button onClick={openCreate} size="sm">
              <Plus className="h-4 w-4" /> Novo post
            </Button>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <Input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por título, slug ou destino"
          className="max-w-sm"
        />
        {semDestino > 0 && (
          <span className="text-body-sm text-muted">
            {semDestino} {semDestino === 1 ? "post sem destino" : "posts sem destino"}, então sem
            bloco de estacionamentos
          </span>
        )}
      </div>

      {isLoading ? (
        <Skeleton className="h-96 w-full" />
      ) : posts.length ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Título</TableHead>
              <TableHead>Categoria</TableHead>
              <TableHead>Autor</TableHead>
              <TableHead>Destino</TableHead>
              <TableHead>Publicado em</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {posts.map((post) => (
              <TableRow key={post.id}>
                <TableCell>
                  <span className="text-title-sm text-ink">{post.title}</span>
                  <span className="block text-caption-sm text-muted">/blog/{post.slug}/</span>
                </TableCell>
                <TableCell className="text-body-sm text-body">
                  {post.category?.name ?? "Sem categoria"}
                </TableCell>
                <TableCell className="text-body-sm text-body">
                  {post.author?.name ?? "Sem autor"}
                </TableCell>
                <TableCell className="text-body-sm text-body">
                  {post.destination?.name ?? "Sem destino"}
                </TableCell>
                <TableCell className="text-body-sm text-body">
                  {formatDate(post.published_at)}
                </TableCell>
                <TableCell>
                  <Badge tone={post.is_published ? "confirmed" : "neutral"}>
                    {post.is_published ? "Publicado" : "Rascunho"}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" size="sm" asChild>
                      <a href={`/blog/${post.slug}/`} target="_blank" rel="noreferrer">
                        <ArrowSquareOut className="h-4 w-4" />
                      </a>
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => openEdit(post)}>
                      Editar
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => remove(post)}>
                      Excluir
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <EmptyState title="Nenhum post encontrado." />
      )}

      <BlogPostForm open={formOpen} onOpenChange={setFormOpen} post={editing} />
      <BlogTaxonomyDialog open={taxonomiaOpen} onOpenChange={setTaxonomiaOpen} />
    </div>
  );
}
