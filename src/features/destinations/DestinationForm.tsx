import * as React from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StateSelect } from "@/components/shared/StateSelect";
import { ImageUploadField } from "@/components/shared/ImageUpload";
import { uploadDestinationImage } from "@/lib/storage";
import { useCreateDestination, useUpdateDestination } from "./api";
import type { Destination } from "@/types/domain";

function slugify(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const TYPES = [
  { value: "airport", label: "Aeroporto" },
  { value: "bus_terminal", label: "Rodoviária" },
  { value: "city_center", label: "Centro" },
  { value: "district", label: "Bairro" },
  { value: "custom", label: "Outro" },
];

type Props = { open: boolean; destination: Destination | null; onOpenChange: (open: boolean) => void };

export function DestinationForm({ open, destination, onOpenChange }: Props) {
  const create = useCreateDestination();
  const update = useUpdateDestination();
  const isEdit = !!destination;

  const [f, setF] = React.useState({
    code: "",
    name: "",
    short_name: "",
    slug: "",
    type: "airport",
    city: "",
    state: "",
    country: "BR",
    latitude: "",
    longitude: "",
    is_popular: false,
    is_published: true,
    sort_order: "100",
    meta_title: "",
    meta_description: "",
    intro: "",
    hero_image_url: "",
  });

  React.useEffect(() => {
    if (!open) return;
    const d = destination;
    setF({
      code: d?.code ?? "",
      name: d?.name ?? "",
      short_name: d?.short_name ?? "",
      slug: d?.slug ?? "",
      type: d?.type ?? "airport",
      city: d?.city ?? "",
      state: d?.state ?? "",
      country: d?.country ?? "BR",
      latitude: d?.latitude != null ? String(d.latitude) : "",
      longitude: d?.longitude != null ? String(d.longitude) : "",
      is_popular: d?.is_popular ?? false,
      is_published: d?.is_published ?? true,
      sort_order: d?.sort_order != null ? String(d.sort_order) : "100",
      meta_title: d?.meta_title ?? "",
      meta_description: d?.meta_description ?? "",
      intro: d?.intro ?? "",
      hero_image_url: d?.hero_image_url ?? "",
    });
  }, [open, destination]);

  function set<K extends keyof typeof f>(k: K, v: (typeof f)[K]) {
    setF((prev) => ({ ...prev, [k]: v }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!f.code || !f.name || !f.city || !f.latitude || !f.longitude) {
      toast.error("Preencha code, nome, cidade, latitude e longitude.");
      return;
    }
    const payload = {
      code: f.code.trim(),
      name: f.name.trim(),
      short_name: f.short_name.trim() || null,
      slug: (f.slug.trim() || slugify(f.name)).trim(),
      type: f.type,
      city: f.city.trim(),
      state: f.state.trim() || null,
      country: f.country.trim() || "BR",
      latitude: Number(f.latitude),
      longitude: Number(f.longitude),
      is_popular: f.is_popular,
      is_published: f.is_published,
      sort_order: Number(f.sort_order || 100),
      meta_title: f.meta_title.trim() || null,
      meta_description: f.meta_description.trim() || null,
      intro: f.intro.trim() || null,
      hero_image_url: f.hero_image_url.trim() || null,
    };
    try {
      if (isEdit && destination) {
        await update.mutateAsync({ id: destination.id, patch: payload });
        toast.success("Destino atualizado");
      } else {
        await create.mutateAsync(payload);
        toast.success("Destino criado");
      }
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar");
    }
  }

  const submitting = create.isPending || update.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar destino" : "Novo destino"}</DialogTitle>
        </DialogHeader>
        <form className="grid grid-cols-1 gap-4 tablet:grid-cols-2" onSubmit={handleSubmit}>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="d-code">Code *</Label>
            <Input id="d-code" required value={f.code} onChange={(e) => set("code", e.target.value)} placeholder="GRU" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Tipo</Label>
            <Select value={f.type} onValueChange={(v) => set("type", v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5 tablet:col-span-2">
            <Label htmlFor="d-name">Nome *</Label>
            <Input
              id="d-name"
              required
              value={f.name}
              onChange={(e) => {
                set("name", e.target.value);
                if (!isEdit) set("slug", slugify(e.target.value));
              }}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="d-short">Nome curto</Label>
            <Input id="d-short" value={f.short_name} onChange={(e) => set("short_name", e.target.value)} placeholder="Guarulhos" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="d-slug">Slug (URL)</Label>
            <Input id="d-slug" value={f.slug} onChange={(e) => set("slug", slugify(e.target.value))} placeholder="aeroporto-de-guarulhos" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="d-city">Cidade *</Label>
            <Input id="d-city" required value={f.city} onChange={(e) => set("city", e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="d-state">UF</Label>
            <StateSelect id="d-state" value={f.state} onValueChange={(v) => set("state", v)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="d-lat">Latitude *</Label>
            <Input id="d-lat" required inputMode="decimal" value={f.latitude} onChange={(e) => set("latitude", e.target.value)} placeholder="-23.43" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="d-lng">Longitude *</Label>
            <Input id="d-lng" required inputMode="decimal" value={f.longitude} onChange={(e) => set("longitude", e.target.value)} placeholder="-46.47" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="d-sort">Ordem</Label>
            <Input id="d-sort" type="number" value={f.sort_order} onChange={(e) => set("sort_order", e.target.value)} />
          </div>
          <div className="flex items-center gap-6 tablet:col-span-1">
            <label className="flex items-center gap-2">
              <Checkbox checked={f.is_popular} onCheckedChange={(v) => set("is_popular", v === true)} />
              <span className="text-body-sm">Popular (home)</span>
            </label>
            <label className="flex items-center gap-2">
              <Checkbox checked={f.is_published} onCheckedChange={(v) => set("is_published", v === true)} />
              <span className="text-body-sm">Publicado</span>
            </label>
          </div>

          <div className="tablet:col-span-2">
            <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.4px] text-muted-steel">SEO / Conteúdo</div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="d-mt">Meta title</Label>
            <Input id="d-mt" value={f.meta_title} onChange={(e) => set("meta_title", e.target.value)} placeholder="Estacionamento em ... | Movepark" />
          </div>
          <div className="flex flex-col gap-1.5 tablet:col-span-2">
            <ImageUploadField
              label="Imagem (hero)"
              value={f.hero_image_url || null}
              onChange={(url) => set("hero_image_url", url ?? "")}
              onUpload={(file) => uploadDestinationImage(f.code.trim(), "hero", file)}
              aspectClass="aspect-[21/9]"
              disabled={!f.code.trim()}
              disabledHint="Preencha o Code antes de enviar a imagem (define a pasta do destino)."
            />
          </div>
          <div className="flex flex-col gap-1.5 tablet:col-span-2">
            <Label htmlFor="d-md">Meta description</Label>
            <Textarea id="d-md" rows={2} value={f.meta_description} onChange={(e) => set("meta_description", e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5 tablet:col-span-2">
            <Label htmlFor="d-intro">Texto de conteúdo (parágrafos separados por linha em branco)</Label>
            <Textarea id="d-intro" rows={5} value={f.intro} onChange={(e) => set("intro", e.target.value)} />
          </div>

          <div className="flex justify-end gap-2 pt-2 tablet:col-span-2">
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Salvando…" : "Salvar"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
