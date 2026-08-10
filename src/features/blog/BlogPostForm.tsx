import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { usePublishedDestinations } from "@/features/destinations/api";
import { Checkbox } from "@/components/ui/checkbox";
import {
  useBlogAuthors,
  useBlogCategories,
  useBlogTags,
  useCreateBlogPost,
  useSetPostTags,
  useUpdateBlogPost,
} from "./api";
import { readingMinutes } from "./markdown.logic";
import type { BlogPostWithDestination } from "@/types/domain";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  post: BlogPostWithDestination | null;
};

const SEM_DESTINO = "sem-destino";

export function BlogPostForm({ open, onOpenChange, post }: Props) {
  const destinations = usePublishedDestinations();
  const categories = useBlogCategories();
  const authors = useBlogAuthors();
  const tags = useBlogTags();
  const create = useCreateBlogPost();
  const update = useUpdateBlogPost();
  const setTags = useSetPostTags();

  const [slug, setSlug] = React.useState("");
  const [title, setTitle] = React.useState("");
  const [excerpt, setExcerpt] = React.useState("");
  const [bodyMd, setBodyMd] = React.useState("");
  const [metaTitle, setMetaTitle] = React.useState("");
  const [metaDescription, setMetaDescription] = React.useState("");
  const [coverImageUrl, setCoverImageUrl] = React.useState("");
  const [destinationId, setDestinationId] = React.useState<string>(SEM_DESTINO);
  const [categoryId, setCategoryId] = React.useState<string>(SEM_DESTINO);
  const [authorId, setAuthorId] = React.useState<string>(SEM_DESTINO);
  const [tagIds, setTagIds] = React.useState<string[]>([]);
  const [isPublished, setIsPublished] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setSlug(post?.slug ?? "");
    setTitle(post?.title ?? "");
    setExcerpt(post?.excerpt ?? "");
    setBodyMd(post?.body_md ?? "");
    setMetaTitle(post?.meta_title ?? "");
    setMetaDescription(post?.meta_description ?? "");
    setCoverImageUrl(post?.cover_image_url ?? "");
    setDestinationId(post?.destination_id ?? SEM_DESTINO);
    setCategoryId(post?.category_id ?? SEM_DESTINO);
    setAuthorId(post?.author_id ?? SEM_DESTINO);
    setTagIds((post?.tags ?? []).map((t) => t.id));
    setIsPublished(post?.is_published ?? false);
  }, [open, post]);

  const saving = create.isPending || update.isPending || setTags.isPending;
  const slugTravado = !!post?.legacy_wp_id;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const payload = {
      slug: slug.trim(),
      title: title.trim(),
      excerpt: excerpt.trim() || null,
      body_md: bodyMd,
      meta_title: metaTitle.trim() || null,
      meta_description: metaDescription.trim() || null,
      cover_image_url: coverImageUrl.trim() || null,
      destination_id: destinationId === SEM_DESTINO ? null : destinationId,
      category_id: categoryId === SEM_DESTINO ? null : categoryId,
      author_id: authorId === SEM_DESTINO ? null : authorId,
      is_published: isPublished,
    };

    try {
      const salvo = post
        ? await update.mutateAsync({ id: post.id, patch: payload })
        : await create.mutateAsync(payload);
      await setTags.mutateAsync({ postId: salvo.id, tagIds });
      toast.success(post ? "Post salvo" : "Post criado");
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{post ? "Editar post" : "Novo post"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="blog-title">Título</Label>
            <Input
              id="blog-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="blog-slug">Slug</Label>
            <Input
              id="blog-slug"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              disabled={slugTravado}
              required
            />
            <p className="text-caption-sm text-muted">
              {slugTravado
                ? "Slug veio do WordPress e não pode mudar: é a URL que o Google já indexou."
                : "Vira /blog/<slug>/. Depois de publicado, mudar quebra a URL."}
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="blog-excerpt">Resumo</Label>
            <Textarea
              id="blog-excerpt"
              value={excerpt}
              onChange={(e) => setExcerpt(e.target.value)}
              rows={2}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="blog-body">Corpo (Markdown)</Label>
            <Textarea
              id="blog-body"
              value={bodyMd}
              onChange={(e) => setBodyMd(e.target.value)}
              rows={16}
              className="font-mono text-body-sm"
              required
            />
            <p className="text-caption-sm text-muted">
              {readingMinutes(bodyMd)} min de leitura. Aceita título, lista, citação, link, imagem,
              negrito e itálico.
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="blog-cover">Imagem de capa</Label>
            <Input
              id="blog-cover"
              value={coverImageUrl}
              onChange={(e) => setCoverImageUrl(e.target.value)}
              placeholder="/images/blog/meu-post/capa.webp"
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="blog-destination">Destino</Label>
            <Select value={destinationId} onValueChange={setDestinationId}>
              <SelectTrigger id="blog-destination">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SEM_DESTINO}>Sem destino</SelectItem>
                {(destinations.data ?? []).map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-caption-sm text-muted">
              Sem destino, o post não mostra o bloco que leva aos estacionamentos.
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="blog-category">Categoria</Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger id="blog-category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SEM_DESTINO}>Sem categoria</SelectItem>
                {(categories.data ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-caption-sm text-muted">
              Tema editorial. O aeroporto é o campo Destino, logo acima.
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="blog-author">Autor</Label>
            <Select value={authorId} onValueChange={setAuthorId}>
              <SelectTrigger id="blog-author">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SEM_DESTINO}>Sem autor</SelectItem>
                {(authors.data ?? []).map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <fieldset className="flex flex-col gap-2">
            <legend className="text-title-sm text-ink">Tags</legend>
            <div className="flex flex-wrap gap-3">
              {(tags.data ?? []).map((t) => (
                <label key={t.id} className="flex items-center gap-2 text-body-sm text-body">
                  <Checkbox
                    checked={tagIds.includes(t.id)}
                    onCheckedChange={(marcado) =>
                      setTagIds((atual) =>
                        marcado ? [...atual, t.id] : atual.filter((id) => id !== t.id),
                      )
                    }
                  />
                  {t.name}
                </label>
              ))}
            </div>
          </fieldset>

          <div className="flex flex-col gap-2">
            <Label htmlFor="blog-meta-title">Meta title</Label>
            <Input
              id="blog-meta-title"
              value={metaTitle}
              onChange={(e) => setMetaTitle(e.target.value)}
              placeholder="Vazio usa o título do post"
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="blog-meta-description">Meta description</Label>
            <Textarea
              id="blog-meta-description"
              value={metaDescription}
              onChange={(e) => setMetaDescription(e.target.value)}
              rows={2}
            />
          </div>

          <div className="flex items-center gap-3">
            <Switch id="blog-published" checked={isPublished} onCheckedChange={setIsPublished} />
            <Label htmlFor="blog-published">Publicado</Label>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Salvando..." : "Salvar"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
