import * as React from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ImageGalleryField } from "@/components/shared/ImageUpload";
import { uploadCompanyAsset } from "@/lib/storage";
import { useCreateLocation, useNearestDestination, useUpdateLocation } from "./api";
import { useAdminDestinations } from "@/features/destinations/api";
import type { EntityStatus, Location } from "@/types/domain";

// Sentinela do <Select> para "sem âncora" (o Radix Select não aceita value="").
const NO_DESTINATION = "__none__";

/** Minutos do traslado: inteiro positivo ou null (vazio/0/negativo → null, casa com o CHECK do banco). */
function parsePositiveInt(value: string): number | null {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function slugify(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

type Props = {
  open: boolean;
  companyId: string;
  location: Location | null;
  onOpenChange: (open: boolean) => void;
  editableScope?: "full" | "operator";
};

export function LocationForm({
  open,
  companyId,
  location,
  onOpenChange,
  editableScope = "full",
}: Props) {
  const create = useCreateLocation();
  const update = useUpdateLocation();
  const isEdit = !!location;
  const operatorMode = editableScope === "operator";

  const [name, setName] = React.useState("");
  const [slug, setSlug] = React.useState("");
  const [address, setAddress] = React.useState("");
  const [timezone, setTimezone] = React.useState("America/Sao_Paulo");
  const [status, setStatus] = React.useState<EntityStatus>("active");
  const [phone, setPhone] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [notice, setNotice] = React.useState("");
  const [directionsText, setDirectionsText] = React.useState("");
  const [shuttleFrequency, setShuttleFrequency] = React.useState("");
  const [shuttleToTerminal, setShuttleToTerminal] = React.useState("");
  const [reservationPolicy, setReservationPolicy] = React.useState("");
  const [destinationId, setDestinationId] = React.useState<string | null>(null);
  const [photos, setPhotos] = React.useState<string[]>([]);

  // Âncora de proximidade só é editável no full scope (hub_admin); operator não toca o vínculo.
  const destinations = useAdminDestinations();
  const hasGeo = location?.latitude != null && location?.longitude != null;
  const nearest = useNearestDestination(
    !operatorMode ? (location?.latitude ?? null) : null,
    !operatorMode ? (location?.longitude ?? null) : null,
  );

  React.useEffect(() => {
    if (open) {
      setName(location?.name ?? "");
      setSlug(location?.slug ?? "");
      setAddress(location?.address ?? "");
      setTimezone(location?.timezone ?? "America/Sao_Paulo");
      setStatus(location?.status ?? "active");
      setPhone(location?.phone ?? "");
      setEmail(location?.email ?? "");
      setNotice(location?.notice ?? "");
      setDirectionsText(location?.directions_text ?? "");
      setShuttleFrequency(
        location?.shuttle_frequency_minutes != null
          ? String(location.shuttle_frequency_minutes)
          : "",
      );
      setShuttleToTerminal(
        location?.shuttle_to_terminal_minutes != null
          ? String(location.shuttle_to_terminal_minutes)
          : "",
      );
      setReservationPolicy(location?.reservation_policy ?? "");
      setDestinationId(location?.destination_id ?? null);
      setPhotos(Array.isArray(location?.photos) ? (location.photos as string[]) : []);
    }
  }, [open, location]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // Conteúdo "Como chegar" (PRD-11) — passo-a-passo + traslado honesto (frequência/tempo).
    const arrivalFields = {
      directions_text: directionsText.trim() || null,
      shuttle_frequency_minutes: parsePositiveInt(shuttleFrequency),
      shuttle_to_terminal_minutes: parsePositiveInt(shuttleToTerminal),
    };

    const fullPayload = {
      name,
      slug: slug || slugify(name),
      address: address || null,
      timezone,
      status,
      phone: phone || null,
      email: email || null,
      notice: notice || null,
      reservation_policy: reservationPolicy || null,
      has_notice: !!notice,
      destination_id: destinationId,
      company_id: companyId,
      photos,
      ...arrivalFields,
    };

    const operatorPatch = {
      name,
      address: address || null,
      phone: phone || null,
      email: email || null,
      notice: notice || null,
      reservation_policy: reservationPolicy || null,
      has_notice: !!notice,
      photos,
      ...arrivalFields,
    };

    try {
      if (isEdit && location) {
        await update.mutateAsync({
          id: location.id,
          patch: operatorMode ? operatorPatch : fullPayload,
        });
        toast.success("Localização atualizada");
      } else {
        await create.mutateAsync(fullPayload);
        toast.success("Localização criada");
      }
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar");
    }
  }

  const submitting = create.isPending || update.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar localização" : "Nova localização"}</DialogTitle>
        </DialogHeader>
        <form className="grid grid-cols-1 gap-4 tablet:grid-cols-2" onSubmit={handleSubmit}>
          <div className="flex flex-col gap-1.5 tablet:col-span-2">
            <Label htmlFor="name">Nome</Label>
            <Input
              id="name"
              required
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (!isEdit && !operatorMode) setSlug(slugify(e.target.value));
              }}
            />
          </div>
          {!operatorMode && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="slug">Slug</Label>
              <Input
                id="slug"
                required
                value={slug}
                onChange={(e) => setSlug(slugify(e.target.value))}
              />
            </div>
          )}
          {!operatorMode && (
            <div className="flex flex-col gap-1.5">
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as EntityStatus)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Ativa</SelectItem>
                  <SelectItem value="inactive">Inativa</SelectItem>
                  <SelectItem value="suspended">Suspensa</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="flex flex-col gap-1.5 tablet:col-span-2">
            <Label htmlFor="address">Endereço</Label>
            <Input id="address" value={address} onChange={(e) => setAddress(e.target.value)} />
          </div>
          {!operatorMode && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="tz">Fuso horário</Label>
              <Input id="tz" value={timezone} onChange={(e) => setTimezone(e.target.value)} />
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="phone">Telefone</Label>
            <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email">E-mail</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          {!operatorMode && (
            <div className="flex flex-col gap-1.5 tablet:col-span-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="destination">Destino (âncora de proximidade)</Label>
                {hasGeo && nearest.data && nearest.data !== destinationId && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setDestinationId(nearest.data ?? null)}
                  >
                    Detectar mais próximo
                  </Button>
                )}
              </div>
              <Select
                value={destinationId ?? NO_DESTINATION}
                onValueChange={(v) => setDestinationId(v === NO_DESTINATION ? null : v)}
              >
                <SelectTrigger id="destination">
                  <SelectValue placeholder="Selecione um destino" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_DESTINATION}>Nenhum</SelectItem>
                  {(destinations.data ?? []).map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.short_name ?? d.name} ({d.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-caption text-muted">
                Usado para ranquear e exibir a distância do lote ao destino. Lotes novos com geo são
                ligados ao mais próximo automaticamente.
              </p>
            </div>
          )}
          <div className="flex flex-col gap-1.5 tablet:col-span-2">
            <Label htmlFor="notice">Aviso crítico de entrada</Label>
            <Textarea
              id="notice"
              value={notice}
              onChange={(e) => setNotice(e.target.value)}
              placeholder="Ex.: Use a Rua Padre Celestino Pavan. O GPS erra a entrada."
            />
            <p className="text-caption text-muted">
              Destacado em alerta no bloco "Como chegar". Use para o que o cliente erra na chegada.
            </p>
          </div>
          <div className="flex flex-col gap-1.5 tablet:col-span-2">
            <Label htmlFor="directions">Como chegar (passo a passo)</Label>
            <Textarea
              id="directions"
              value={directionsText}
              onChange={(e) => setDirectionsText(e.target.value)}
              placeholder="Ex.: Entre pela rua lateral (não pela entrada principal). Recepção coberta à direita."
            />
            <p className="text-caption text-muted">
              O passo-a-passo de chegada. O endereço diz onde fica; aqui você diz como entrar.
            </p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="shuttle-freq">Traslado · frequência (min)</Label>
            <Input
              id="shuttle-freq"
              type="number"
              min={1}
              value={shuttleFrequency}
              onChange={(e) => setShuttleFrequency(e.target.value)}
              placeholder="15"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="shuttle-terminal">Traslado · tempo até o terminal (min)</Label>
            <Input
              id="shuttle-terminal"
              type="number"
              min={1}
              value={shuttleToTerminal}
              onChange={(e) => setShuttleToTerminal(e.target.value)}
              placeholder="6"
            />
          </div>
          <div className="flex flex-col gap-1.5 tablet:col-span-2">
            <Label htmlFor="policy">Política de reserva</Label>
            <Textarea
              id="policy"
              value={reservationPolicy}
              onChange={(e) => setReservationPolicy(e.target.value)}
            />
          </div>
          <div className="tablet:col-span-2">
            <ImageGalleryField
              label="Fotos da unidade"
              values={photos}
              onChange={setPhotos}
              onUpload={(file) => uploadCompanyAsset(companyId, "photo", file)}
            />
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
