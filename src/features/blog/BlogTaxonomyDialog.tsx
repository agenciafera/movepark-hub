import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ImageUploadField } from "@/components/shared/ImageUpload";
import { uploadBlogAuthorImage } from "@/lib/storage";
import {
  useAdminBlogPosts,
  useBlogAuthors,
  useBlogCategories,
  useBlogTags,
  useCreateBlogAuthor,
  useCreateBlogCategory,
  useCreateBlogTag,
  useDeleteBlogAuthor,
  useUpdateBlogAuthor,
} from "./api";
import type { BlogAuthor } from "@/types/domain";

/** Slug a partir do nome: sem acento, minúsculo, hífen no lugar de espaço. */
export function slugify(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Uma linha por autor: nome, bio, foto e exclusão.
 *
 * Excluir é bloqueado enquanto o autor assina algum post. A FK é
 * `on delete set null`, então excluir sem checar tiraria a assinatura dos posts
 * em silêncio, e não há tela que mostre isso depois.
 */
function AuthorRow({
  author,
  posts,
  onSave,
  onDelete,
}: {
  author: BlogAuthor;
  posts: number;
  onSave: (patch: { name: string; bio: string | null }) => void;
  onDelete: () => void;
}) {
  const [name, setName] = React.useState(author.name);
  const [bio, setBio] = React.useState(author.bio ?? "");
  const [avatar, setAvatar] = React.useState(author.avatar_url);

  const mudou = name !== author.name || bio !== (author.bio ?? "");

  return (
    <li className="flex flex-col gap-3 rounded-md border border-hairline p-4">
      <div className="flex gap-4">
        <div className="w-24 shrink-0">
          <ImageUploadField
            value={avatar}
            onChange={(url) => {
              setAvatar(url);
              onSave({ name, bio: bio.trim() || null });
            }}
            onUpload={(file) => uploadBlogAuthorImage(author.slug, "foto", file)}
            aspectClass="aspect-square"
          />
        </div>

        <div className="flex flex-1 flex-col gap-2">
          <Input
            value={name}
            aria-label={`Nome de ${author.name}`}
            onChange={(e) => setName(e.target.value)}
          />
          <Textarea
            value={bio}
            aria-label={`Bio de ${author.name}`}
            onChange={(e) => setBio(e.target.value)}
            placeholder="Bio curta, mostrada no topo da página do autor"
            rows={2}
          />
          <span className="text-caption-sm text-muted">
            /blog/autor/{author.slug}/ · {posts === 1 ? "1 post" : `${posts} posts`}
          </span>
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={posts > 0}
          title={posts > 0 ? "Troque o autor dos posts dele antes de excluir." : undefined}
          onClick={() => {
            if (confirm(`Excluir o autor "${author.name}"?`)) onDelete();
          }}
        >
          Excluir
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={!mudou || !name.trim()}
          onClick={() => onSave({ name: name.trim(), bio: bio.trim() || null })}
        >
          Salvar
        </Button>
      </div>
    </li>
  );
}

type Props = { open: boolean; onOpenChange: (open: boolean) => void };

export function BlogTaxonomyDialog({ open, onOpenChange }: Props) {
  const categories = useBlogCategories();
  const tags = useBlogTags();
  const authors = useBlogAuthors();

  const createCategory = useCreateBlogCategory();
  const createTag = useCreateBlogTag();
  const createAuthor = useCreateBlogAuthor();
  const updateAuthor = useUpdateBlogAuthor();
  const deleteAuthor = useDeleteBlogAuthor();
  const posts = useAdminBlogPosts();

  const [catName, setCatName] = React.useState("");
  const [catDesc, setCatDesc] = React.useState("");
  const [tagName, setTagName] = React.useState("");
  const [authorName, setAuthorName] = React.useState("");
  const [authorBio, setAuthorBio] = React.useState("");

  async function submit(acao: () => Promise<unknown>, limpar: () => void, sucesso: string) {
    try {
      await acao();
      limpar();
      toast.success(sucesso);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Taxonomia do blog</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="categorias">
          <TabsList>
            <TabsTrigger value="categorias">Categorias</TabsTrigger>
            <TabsTrigger value="tags">Tags</TabsTrigger>
            <TabsTrigger value="autores">Autores</TabsTrigger>
          </TabsList>

          <TabsContent value="categorias" className="flex flex-col gap-4 pt-4">
            <p className="text-body-sm text-body">
              Tema editorial do post. Aeroporto não entra aqui: ele é o campo Destino, que já leva
              o leitor para a página de estacionamentos.
            </p>
            <ul className="flex flex-col gap-1">
              {(categories.data ?? []).map((c) => (
                <li key={c.id} className="text-body-sm text-body">
                  {c.name} <span className="text-muted">/blog/categoria/{c.slug}/</span>
                </li>
              ))}
            </ul>
            <div className="flex flex-col gap-2 border-t border-hairline pt-4">
              <Label htmlFor="cat-name">Nova categoria</Label>
              <Input
                id="cat-name"
                value={catName}
                onChange={(e) => setCatName(e.target.value)}
                placeholder="Nome"
              />
              <Textarea
                value={catDesc}
                onChange={(e) => setCatDesc(e.target.value)}
                placeholder="Descrição, usada no topo da página da categoria"
                rows={2}
              />
              <Button
                type="button"
                disabled={!catName.trim() || createCategory.isPending}
                onClick={() =>
                  submit(
                    () =>
                      createCategory.mutateAsync({
                        name: catName.trim(),
                        slug: slugify(catName),
                        description: catDesc.trim() || null,
                      }),
                    () => {
                      setCatName("");
                      setCatDesc("");
                    },
                    "Categoria criada",
                  )
                }
              >
                Criar categoria
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="tags" className="flex flex-col gap-4 pt-4">
            <div className="flex flex-wrap gap-2">
              {(tags.data ?? []).map((t) => (
                <span
                  key={t.id}
                  className="rounded-full border border-hairline px-3 py-1 text-caption text-body"
                >
                  {t.name}
                </span>
              ))}
            </div>
            <div className="flex flex-col gap-2 border-t border-hairline pt-4">
              <Label htmlFor="tag-name">Nova tag</Label>
              <Input
                id="tag-name"
                value={tagName}
                onChange={(e) => setTagName(e.target.value)}
                placeholder="Nome"
              />
              <Button
                type="button"
                disabled={!tagName.trim() || createTag.isPending}
                onClick={() =>
                  submit(
                    () =>
                      createTag.mutateAsync({ name: tagName.trim(), slug: slugify(tagName) }),
                    () => setTagName(""),
                    "Tag criada",
                  )
                }
              >
                Criar tag
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="autores" className="flex flex-col gap-4 pt-4">
            <ul className="flex flex-col gap-4">
              {(authors.data ?? []).map((a) => (
                <AuthorRow
                  key={a.id}
                  author={a}
                  posts={(posts.data ?? []).filter((p) => p.author?.id === a.id).length}
                  onSave={(patch) =>
                    submit(
                      () => updateAuthor.mutateAsync({ id: a.id, patch }),
                      () => {},
                      "Autor atualizado",
                    )
                  }
                  onDelete={() =>
                    submit(() => deleteAuthor.mutateAsync(a.id), () => {}, "Autor excluído")
                  }
                />
              ))}
            </ul>
            <div className="flex flex-col gap-2 border-t border-hairline pt-4">
              <Label htmlFor="author-name">Novo autor</Label>
              <Input
                id="author-name"
                value={authorName}
                onChange={(e) => setAuthorName(e.target.value)}
                placeholder="Nome de exibição"
              />
              <Textarea
                value={authorBio}
                onChange={(e) => setAuthorBio(e.target.value)}
                placeholder="Bio curta, mostrada na página do autor"
                rows={2}
              />
              <Button
                type="button"
                disabled={!authorName.trim() || createAuthor.isPending}
                onClick={() =>
                  submit(
                    () =>
                      createAuthor.mutateAsync({
                        name: authorName.trim(),
                        slug: slugify(authorName),
                        bio: authorBio.trim() || null,
                      }),
                    () => {
                      setAuthorName("");
                      setAuthorBio("");
                    },
                    "Autor criado",
                  )
                }
              >
                Criar autor
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
