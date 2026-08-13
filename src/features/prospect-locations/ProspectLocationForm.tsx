import * as React from "react";
import { toast } from "sonner";
import { Warning } from "@phosphor-icons/react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAdminDestinations } from "@/features/destinations/api";
import { useAmenityCatalog } from "@/features/amenities/api";
import { formatDistance } from "@/lib/format";
import { useProspectLocationPrecheck, useSaveProspectLocation } from "./api";
import type { ProspectLocationAdminRow, ProspectLocationPrecheck } from "@/types/domain";

function slugify(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Origem do dado, espelhando o `check` da coluna `data_source`. */
const DATA_SOURCES = [
  { value: "manual", label: "Manual" },
  { value: "google_places", label: "Google Places" },
  { value: "import_wp", label: "Importado do WordPress" },
];

/** `distance_m` chega em metros e o formatador do repo fala em km. */
function metersLabel(m: number | null | undefined) {
  if (m === null || m === undefined) return null;
  return formatDistance(m / 1000);
}

function kindLabel(kind: "location" | "prospect") {
  return kind === "location" ? "parceiro" : "lote";
}

type Props = {
  open: boolean;
  prospect: ProspectLocationAdminRow | null;
  onOpenChange: (open: boolean) => void;
};

/**
 * Cadastro do lote mapeado (E0.17-h).
 *
 * A pré-checagem (destino sugerido, colisão de Place ID, colisão de slug, vizinhos a menos
 * de 150 m) roda no blur dos campos que a alimentam e só AVISA: D-009 pede aviso na tela,
 * não decisão automática, porque dois lotes vizinhos existem de verdade em aeroporto. O
 * único gate real é publicar sem endereço, que o servidor recusa de qualquer jeito.
 */
export function ProspectLocationForm({ open, prospect, onOpenChange }: Props) {
  const destinations = useAdminDestinations();
  const amenities = useAmenityCatalog();
  const save = useSaveProspectLocation();
  const precheck = useProspectLocationPrecheck();
  const isEdit = !!prospect;

  const [pre, setPre] = React.useState<ProspectLocationPrecheck | null>(null);
  const [f, setF] = React.useState({
    name: "",
    slug: "",
    latitude: "",
    longitude: "",
    destinationId: "",
    address: "",
    phone: "",
    googlePlaceId: "",
    googleMapsUrl: "",
    description: "",
    dataSource: "manual",
    amenities: [] as string[],
    isPublished: false,
  });

  React.useEffect(() => {
    if (!open) return;
    const p = prospect;
    setPre(null);
    setF({
      name: p?.name ?? "",
      slug: p?.slug ?? "",
      latitude: p?.latitude != null ? String(p.latitude) : "",
      longitude: p?.longitude != null ? String(p.longitude) : "",
      destinationId: p?.destination_id ?? "",
      address: p?.address ?? "",
      phone: p?.phone ?? "",
      googlePlaceId: p?.google_place_id ?? "",
      googleMapsUrl: p?.google_maps_url ?? "",
      description: p?.description ?? "",
      dataSource: p?.data_source ?? "manual",
      amenities: p?.amenities ?? [],
      isPublished: p?.is_published ?? false,
    });
  }, [open, prospect]);

  function set<K extends keyof typeof f>(k: K, v: (typeof f)[K]) {
    setF((prev) => ({ ...prev, [k]: v }));
  }

  function toggleAmenity(code: string, on: boolean) {
    setF((prev) => ({
      ...prev,
      amenities: on ? [...prev.amenities, code] : prev.amenities.filter((c) => c !== code),
    }));
  }

  async function runPrecheck() {
    const lat = Number(f.latitude);
    const lng = Number(f.longitude);
    if (!f.latitude || !f.longitude || !Number.isFinite(lat) || !Number.isFinite(lng)) return;
    try {
      const result = await precheck.mutateAsync({
        latitude: lat,
        longitude: lng,
        googlePlaceId: f.googlePlaceId.trim() || undefined,
        slug: f.slug.trim() || undefined,
        id: prospect?.id ?? undefined,
      });
      setPre(result);
    } catch {
      // A pré-checagem é auxiliar. Se ela falhar, o formulário segue salvável.
      setPre(null);
    }
  }

  const addressEmpty = !f.address.trim();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!f.name.trim()) {
      toast.error("Preencha o nome do lote.");
      return;
    }
    if (!f.slug.trim()) {
      toast.error("Preencha o slug, que é a URL da ficha.");
      return;
    }
    const lat = Number(f.latitude);
    const lng = Number(f.longitude);
    if (!f.latitude || !f.longitude || !Number.isFinite(lat) || !Number.isFinite(lng)) {
      toast.error("Preencha latitude e longitude com números.");
      return;
    }
    if (!f.destinationId) {
      toast.error("Escolha o destino do lote.");
      return;
    }
    if (f.isPublished && addressEmpty) {
      toast.error("Preencha o endereço para poder publicar.");
      return;
    }
    try {
      await save.mutateAsync({
        id: prospect?.id ?? null,
        name: f.name.trim(),
        slug: f.slug.trim(),
        latitude: lat,
        longitude: lng,
        destinationId: f.destinationId || null,
        address: f.address.trim() || null,
        phone: f.phone.trim() || null,
        googlePlaceId: f.googlePlaceId.trim() || null,
        googleMapsUrl: f.googleMapsUrl.trim() || null,
        description: f.description.trim() || null,
        amenities: f.amenities,
        dataSource: f.dataSource,
        isPublished: f.isPublished,
      });
      toast.success("Lote salvo");
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar");
    }
  }

  const suggested = pre?.suggested_destination ?? null;
  const showSuggestion = !!suggested && suggested.id !== f.destinationId;
  const hasWarning =
    showSuggestion ||
    !!pre?.place_id_conflict ||
    !!pre?.slug_conflict ||
    (pre?.nearby?.length ?? 0) > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar lote mapeado" : "Novo lote mapeado"}</DialogTitle>
        </DialogHeader>
        <form className="grid grid-cols-1 gap-4 tablet:grid-cols-2" onSubmit={handleSubmit}>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pl-name">Nome *</Label>
            <Input
              id="pl-name"
              required
              value={f.name}
              onChange={(e) => {
                set("name", e.target.value);
                if (!isEdit) set("slug", slugify(e.target.value));
              }}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pl-slug">Slug (URL) *</Label>
            <Input
              id="pl-slug"
              required
              value={f.slug}
              onChange={(e) => set("slug", slugify(e.target.value))}
              onBlur={runPrecheck}
              placeholder="talentos-park"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pl-lat">Latitude *</Label>
            <Input
              id="pl-lat"
              required
              inputMode="decimal"
              value={f.latitude}
              onChange={(e) => set("latitude", e.target.value)}
              onBlur={runPrecheck}
              placeholder="-8.13"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pl-lng">Longitude *</Label>
            <Input
              id="pl-lng"
              required
              inputMode="decimal"
              value={f.longitude}
              onChange={(e) => set("longitude", e.target.value)}
              onBlur={runPrecheck}
              placeholder="-34.92"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pl-destination">Destino *</Label>
            <Select value={f.destinationId} onValueChange={(v) => set("destinationId", v)}>
              <SelectTrigger id="pl-destination">
                <SelectValue placeholder="Escolha o destino" />
              </SelectTrigger>
              <SelectContent>
                {(destinations.data ?? []).map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pl-source">Origem do dado</Label>
            <Select value={f.dataSource} onValueChange={(v) => set("dataSource", v)}>
              <SelectTrigger id="pl-source">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DATA_SOURCES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5 tablet:col-span-2">
            <Label htmlFor="pl-address">Endereço</Label>
            <Input
              id="pl-address"
              value={f.address}
              onChange={(e) => set("address", e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pl-phone">Telefone</Label>
            <Input id="pl-phone" value={f.phone} onChange={(e) => set("phone", e.target.value)} />
            <p className="text-caption text-muted">
              Guardado para a reivindicação. Não aparece na página nem no schema.
            </p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pl-place">Google Place ID</Label>
            <Input
              id="pl-place"
              value={f.googlePlaceId}
              onChange={(e) => set("googlePlaceId", e.target.value)}
              onBlur={runPrecheck}
            />
          </div>
          <div className="flex flex-col gap-1.5 tablet:col-span-2">
            <Label htmlFor="pl-maps">Link do Google Maps</Label>
            <Input
              id="pl-maps"
              value={f.googleMapsUrl}
              onChange={(e) => set("googleMapsUrl", e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1.5 tablet:col-span-2">
            <Label htmlFor="pl-description">Descrição</Label>
            <Textarea
              id="pl-description"
              rows={4}
              value={f.description}
              onChange={(e) => set("description", e.target.value)}
            />
            <p className="text-caption text-muted">
              Escreva com as suas palavras. Copiar o texto do site do lote é conteúdo duplicado e
              obra de terceiro.
            </p>
          </div>

          <div className="flex flex-col gap-2 tablet:col-span-2">
            <Label>Amenidades</Label>
            <div className="grid grid-cols-1 gap-2 tablet:grid-cols-3">
              {(amenities.data ?? []).map((a) => (
                <label key={a.code} className="flex items-center gap-2">
                  <Checkbox
                    checked={f.amenities.includes(a.code)}
                    onCheckedChange={(v) => toggleAmenity(a.code, v === true)}
                  />
                  <span className="text-body-sm">{a.name}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1.5 tablet:col-span-2">
            <div className="flex items-center gap-3">
              <Switch
                checked={f.isPublished}
                onCheckedChange={(v) => set("isPublished", v)}
                disabled={addressEmpty}
                aria-label="Publicado"
              />
              <span className="text-body-sm text-ink">Publicado</span>
              {addressEmpty && (
                <span className="text-caption text-muted">
                  Preencha o endereço para poder publicar.
                </span>
              )}
            </div>
          </div>

          {hasWarning && (
            <div className="flex flex-col gap-2 rounded-md border border-hairline bg-surface-soft p-3 tablet:col-span-2">
              {showSuggestion && suggested && (
                <div className="flex flex-wrap items-center gap-2 text-body-sm text-body">
                  <span>
                    Pela localização, o destino é {suggested.name}, a{" "}
                    {metersLabel(suggested.distance_m)} do terminal.
                  </span>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => set("destinationId", suggested.id)}
                  >
                    Usar este destino
                  </Button>
                </div>
              )}
              {pre?.place_id_conflict && (
                <p className="flex items-start gap-1.5 text-body-sm text-error">
                  <Warning className="mt-0.5 h-4 w-4 shrink-0" />
                  Este Place ID já é do {kindLabel(pre.place_id_conflict.kind)}{" "}
                  {pre.place_id_conflict.name}. Parceiro ativo não deve ser mapeado.
                </p>
              )}
              {pre?.slug_conflict && (
                <p className="flex items-start gap-1.5 text-body-sm text-error">
                  <Warning className="mt-0.5 h-4 w-4 shrink-0" />
                  Este slug já é de {pre.slug_conflict.name}. Escolha outro, senão a ficha fica sem
                  URL.
                </p>
              )}
              {(pre?.nearby?.length ?? 0) > 0 && pre && (
                <p className="text-body-sm text-body">
                  Tem {pre.nearby.length}{" "}
                  {pre.nearby.length === 1 ? "estacionamento" : "estacionamentos"} a menos de 150 m
                  daqui: {pre.nearby.map((n) => n.name).join(", ")}. Confira se não é o mesmo lote.
                </p>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2 tablet:col-span-2">
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? "Salvando…" : "Salvar"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
