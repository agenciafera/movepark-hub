import * as React from "react";
import { toast } from "sonner";
import { X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { StepShell } from "../StepShell";
import { useUpsertLocation, uploadPartnerAsset, type OnboardingData } from "../wizardApi";

type Props = { data: OnboardingData; companyId: string; onNext: () => void; onBack: () => void };

export function Step2Location({ data, companyId, onNext, onBack }: Props) {
  const save = useUpsertLocation(companyId);
  const loc = data.location;
  const [name, setName] = React.useState(loc?.name ?? "");
  const [address, setAddress] = React.useState(loc?.address ?? "");
  const [lat, setLat] = React.useState(loc?.latitude != null ? String(loc.latitude) : "");
  const [lng, setLng] = React.useState(loc?.longitude != null ? String(loc.longitude) : "");
  const [phone, setPhone] = React.useState(loc?.phone ?? "");
  const [email, setEmail] = React.useState(loc?.email ?? "");
  const [policy, setPolicy] = React.useState(loc?.reservation_policy ?? "");
  const [photos, setPhotos] = React.useState<string[]>(loc?.photos ?? []);
  const [uploading, setUploading] = React.useState(false);

  async function handlePhotos(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setUploading(true);
    try {
      const urls = await Promise.all(files.map((f) => uploadPartnerAsset(companyId, f, "photo")));
      setPhotos((prev) => [...prev, ...urls]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha no upload");
    } finally {
      setUploading(false);
    }
  }

  async function handleNext() {
    if (!name.trim()) return toast.error("Informe o nome da localização.");
    try {
      await save.mutateAsync({
        p_company_id: companyId,
        p_location_id: loc?.id ?? null,
        p_name: name,
        p_address: address || null,
        p_latitude: lat ? Number(lat) : null,
        p_longitude: lng ? Number(lng) : null,
        p_phone: phone || null,
        p_email: email || null,
        p_reservation_policy: policy || null,
        p_photos: photos,
      });
      onNext();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar");
    }
  }

  return (
    <StepShell
      title="Localização"
      description="Onde fica seu estacionamento e como o cliente chega."
      onBack={onBack}
      onNext={handleNext}
      busy={save.isPending}
    >
      <div className="grid grid-cols-1 gap-4 tablet:grid-cols-2">
        <div className="flex flex-col gap-1.5 tablet:col-span-2">
          <Label htmlFor="loc_name">Nome da unidade *</Label>
          <Input id="loc_name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Unidade Aeroporto" required />
        </div>
        <div className="flex flex-col gap-1.5 tablet:col-span-2">
          <Label htmlFor="address">Endereço</Label>
          <Input id="address" value={address} onChange={(e) => setAddress(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="lat">Latitude</Label>
          <Input id="lat" value={lat} onChange={(e) => setLat(e.target.value)} placeholder="-23.5505" inputMode="decimal" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="lng">Longitude</Label>
          <Input id="lng" value={lng} onChange={(e) => setLng(e.target.value)} placeholder="-46.6333" inputMode="decimal" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="loc_phone">Telefone</Label>
          <Input id="loc_phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="loc_email">E-mail</Label>
          <Input id="loc_email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5 tablet:col-span-2">
          <Label htmlFor="policy">Instruções de acesso</Label>
          <Textarea id="policy" rows={3} value={policy} onChange={(e) => setPolicy(e.target.value)} placeholder="Como o cliente entra, retira a senha, etc." />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label>Fotos da unidade</Label>
        <div className="flex flex-wrap gap-2">
          {photos.map((url) => (
            <div key={url} className="relative h-20 w-28 overflow-hidden rounded-sm border border-hairline">
              <img src={url} alt="" className="h-full w-full object-cover" />
              <button
                type="button"
                onClick={() => setPhotos((p) => p.filter((u) => u !== url))}
                className="absolute right-1 top-1 rounded-full bg-canvas/90 p-0.5 text-ink shadow-tier"
                aria-label="Remover foto"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          <input id="photos" type="file" accept="image/*" multiple className="hidden" onChange={handlePhotos} />
          <Button asChild variant="outline" size="sm" disabled={uploading}>
            <label htmlFor="photos" className="cursor-pointer">
              {uploading ? "Enviando…" : "+ Foto"}
            </label>
          </Button>
        </div>
      </div>
    </StepShell>
  );
}
