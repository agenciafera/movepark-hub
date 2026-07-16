import * as React from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ArrowRight, ArrowLeft, MapPin, BusFront, Sparkles } from "lucide-react";
import { Wordmark } from "@/components/shared/Brand";
import { OnboardingJourney } from "@/components/shared/OnboardingJourney";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { CurrencyInput } from "@/components/ui/currency-input";
import {
  GooglePlacesAutocomplete,
  isGooglePlacesEnabled,
} from "@/components/shared/GooglePlacesAutocomplete";
import { useNearestDestination } from "@/features/locations/api";
import { usePublishedDestinations } from "@/features/destinations/api";
import {
  useUpsertLocation,
  useSetParkingTypes,
  usePublishOnboarding,
  type OnboardingData,
} from "../wizardApi";
import { UnitPreviewCard, type PreviewItem } from "./UnitPreviewCard";
import { buildParkingItems, validateParkingItems, validateAddress } from "./publishLogic";

type Props = { data: OnboardingData; companyId: string };

type Row = { selected: boolean; base_price: number | null; capacity: string };

const TOTAL_STEPS = 4;

export function PublishWizard({ data, companyId }: Props) {
  const navigate = useNavigate();
  const upsertLocation = useUpsertLocation(companyId);
  const setParkingTypes = useSetParkingTypes(companyId);
  const publish = usePublishOnboarding(companyId);
  const { data: destinations } = usePublishedDestinations();

  const loc = data.location;
  const [step, setStep] = React.useState(1);
  const [locationId, setLocationId] = React.useState<string | null>(loc?.id ?? null);

  // ── estado do formulário ────────────────────────────────────────────────
  const [name, setName] = React.useState(loc?.name ?? data.company.name ?? "");
  const [address, setAddress] = React.useState(loc?.address ?? "");
  const [lat, setLat] = React.useState<number | null>(loc?.latitude ?? null);
  const [lng, setLng] = React.useState<number | null>(loc?.longitude ?? null);
  const [destinationId, setDestinationId] = React.useState<string | null>(loc?.destination_id ?? null);
  const [hasShuttle, setHasShuttle] = React.useState<boolean | null>(loc?.has_shuttle ?? null);

  const [rows, setRows] = React.useState<Record<string, Row>>(() => {
    const init: Record<string, Row> = {};
    for (const pt of data.catalog) {
      const existing = data.items.find((i) => i.parking_type_id === pt.id);
      init[pt.id] = existing
        ? { selected: true, base_price: existing.base_price, capacity: String(existing.capacity) }
        : { selected: false, base_price: null, capacity: "" };
    }
    return init;
  });

  // sugestão de destino a partir da geo (auto-detecção genérica: aeroporto/rodoviária/centro/bairro)
  const nearest = useNearestDestination(lat, lng);
  React.useEffect(() => {
    if (!destinationId && nearest.data) setDestinationId(nearest.data);
  }, [nearest.data, destinationId]);

  const destName = React.useMemo(
    () => destinations?.find((d) => d.id === destinationId)?.name ?? null,
    [destinations, destinationId],
  );

  const previewItems: PreviewItem[] = data.catalog
    .filter((pt) => rows[pt.id]?.selected)
    .map((pt) => ({ name: pt.name, base_price: rows[pt.id].base_price, capacity: Number(rows[pt.id].capacity || 0) }));

  function patchRow(id: string, p: Partial<Row>) {
    setRows((prev) => ({ ...prev, [id]: { ...prev[id], ...p } }));
  }

  /** Salva a location com o payload COMPLETO (o upsert não faz coalesce de address/geo). */
  async function persistLocation(): Promise<string> {
    const id = await upsertLocation.mutateAsync({
      p_company_id: companyId,
      p_location_id: locationId,
      p_name: name,
      p_address: address || null,
      p_latitude: lat,
      p_longitude: lng,
      p_photos: loc?.photos ?? [],
      p_destination_id: destinationId,
      p_has_shuttle: hasShuttle ?? false,
    });
    const newId = (id as string) ?? locationId;
    if (newId) setLocationId(newId);
    return newId as string;
  }

  async function goFromAddress() {
    const err = validateAddress({ name, address, lat, lng });
    if (err) {
      if (lat == null || lng == null) {
        return toast.error(
          isGooglePlacesEnabled
            ? "Selecione o endereço na lista para localizarmos no mapa."
            : "Informe latitude e longitude.",
        );
      }
      return toast.error(err);
    }
    try {
      await persistLocation();
      setStep(2);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar.");
    }
  }

  async function goFromDestination() {
    try {
      await persistLocation();
      setStep(3);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar.");
    }
  }

  async function goFromParkingTypes() {
    const id = locationId;
    if (!id) return toast.error("Salve o endereço primeiro.");
    const items = buildParkingItems(data.catalog, rows);
    const err = validateParkingItems(items);
    if (err) return toast.error(err);
    try {
      await setParkingTypes.mutateAsync({ p_company_id: companyId, p_location_id: id, p_items: items });
      setStep(4);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar.");
    }
  }

  async function doPublish() {
    if (hasShuttle == null) return toast.error("Responda sobre o transfer para continuar.");
    try {
      await persistLocation(); // grava has_shuttle
      await publish.mutateAsync({ p_company_id: companyId });
      const id = locationId;
      toast.success("Sua unidade está no ar! 🚗");
      if (id) navigate(`/operator/preview/${id}?published=1`, { replace: true });
      else navigate("/operator", { replace: true });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível publicar.");
    }
  }

  const busy = upsertLocation.isPending || setParkingTypes.isPending || publish.isPending;

  return (
    <div className="min-h-screen bg-surface-soft">
      <div className="mx-auto grid max-w-[1080px] gap-8 px-4 py-8 tablet:py-12 desktop:grid-cols-[1fr_360px] desktop:px-8">
        {/* Coluna do formulário */}
        <div className="flex flex-col gap-6">
          <Wordmark height={24} />

          {/* trilha macro: publicar é a fase 1 de 3 */}
          <OnboardingJourney current="publicar" />

          {/* progresso */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              {Array.from({ length: TOTAL_STEPS }, (_, i) => i + 1).map((n) => (
                <div
                  key={n}
                  className={"h-1.5 flex-1 rounded-full " + (n <= step ? "bg-mp-primary" : "bg-surface-pale")}
                />
              ))}
            </div>
            <p className="text-caption-sm text-muted">
              Passo {step} de {TOTAL_STEPS} · leva ~2 minutos
            </p>
          </div>

          <div className="rounded-lg border border-hairline bg-canvas p-6 shadow-tier tablet:p-8">
            {step === 1 && (
              <div className="flex flex-col gap-5">
                <div className="space-y-1">
                  <h1 className="text-display-md text-ink">Onde fica seu estacionamento?</h1>
                  <p className="text-body-sm text-muted">
                    Buscamos o endereço e localizamos no mapa pra você, sem digitar coordenadas na mão.
                  </p>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="unit-name">Nome da unidade</Label>
                  <Input
                    id="unit-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ex: Unidade Aeroporto"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="unit-address">Endereço</Label>
                  <GooglePlacesAutocomplete
                    id="unit-address"
                    value={address}
                    onChange={(a) => {
                      setAddress(a);
                      // ao editar o texto manualmente, invalida a geo até nova seleção (se Google ativo)
                      if (isGooglePlacesEnabled) {
                        setLat(null);
                        setLng(null);
                      }
                    }}
                    onSelect={(p) => {
                      setAddress(p.address);
                      setLat(p.latitude);
                      setLng(p.longitude);
                    }}
                  />
                  {lat != null && lng != null && (
                    <p className="flex items-center gap-1 text-caption-sm text-success">
                      <MapPin className="h-3.5 w-3.5" /> Localização confirmada no mapa
                    </p>
                  )}
                </div>
                {!isGooglePlacesEnabled && (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="lat">Latitude</Label>
                      <Input
                        id="lat"
                        inputMode="decimal"
                        value={lat ?? ""}
                        onChange={(e) => setLat(e.target.value ? Number(e.target.value) : null)}
                        placeholder="-23.5505"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="lng">Longitude</Label>
                      <Input
                        id="lng"
                        inputMode="decimal"
                        value={lng ?? ""}
                        onChange={(e) => setLng(e.target.value ? Number(e.target.value) : null)}
                        placeholder="-46.6333"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            {step === 2 && (
              <div className="flex flex-col gap-5">
                <div className="space-y-1">
                  <h1 className="text-display-md text-ink">Qual destino você atende?</h1>
                  <p className="text-body-sm text-muted">
                    Detectamos o ponto mais próximo. Confirme ou escolha outro.
                  </p>
                </div>
                {nearest.isFetching && !destName ? (
                  <p className="text-body-sm text-muted">Detectando o destino mais próximo…</p>
                ) : null}
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="destination">Destino</Label>
                  <select
                    id="destination"
                    value={destinationId ?? ""}
                    onChange={(e) => setDestinationId(e.target.value || null)}
                    className="h-10 rounded-md border border-hairline bg-canvas px-3 text-body-sm text-ink"
                  >
                    <option value="">Nenhum / não se aplica</option>
                    {(destinations ?? []).map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name} · {d.city}/{d.state}
                      </option>
                    ))}
                  </select>
                  {destName && nearest.data === destinationId && (
                    <p className="text-caption-sm text-mp-indigo">
                      Sugerido automaticamente pela localização.
                    </p>
                  )}
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="flex flex-col gap-5">
                <div className="space-y-1">
                  <h1 className="text-display-md text-ink">Suas vagas e o preço de balcão</h1>
                  <p className="text-body-sm text-muted">
                    Informe o preço que você cobra no balcão hoje. É a base. A Movepark monta um preço
                    online mais atrativo a partir dele, e <strong className="text-ink">você aprova antes de valer</strong>. Você segue no controle.
                  </p>
                </div>
                <div className="flex flex-col divide-y divide-hairline rounded-md border border-hairline">
                  {data.catalog.map((pt) => {
                    const row = rows[pt.id];
                    return (
                      <div key={pt.id} className="flex flex-col gap-3 p-4">
                        <label className="flex items-center gap-3">
                          <Checkbox
                            checked={row.selected}
                            onCheckedChange={(v) => patchRow(pt.id, { selected: v === true })}
                          />
                          <span className="text-body-md text-ink">{pt.name}</span>
                        </label>
                        {row.selected && (
                          <div className="flex flex-wrap gap-3 pl-8">
                            <div className="flex flex-col gap-1">
                              <Label className="text-caption">Preço de balcão/diária</Label>
                              <CurrencyInput
                                value={row.base_price}
                                onChange={(v) => patchRow(pt.id, { base_price: v })}
                                className="w-36"
                              />
                            </div>
                            <div className="flex flex-col gap-1">
                              <Label className="text-caption">Capacidade</Label>
                              <Input
                                type="number"
                                min={0}
                                value={row.capacity}
                                onChange={(e) => patchRow(pt.id, { capacity: e.target.value })}
                                className="w-28"
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {step === 4 && (
              <div className="flex flex-col gap-5">
                <div className="space-y-1">
                  <h1 className="text-display-md text-ink">Você oferece transfer?</h1>
                  <p className="text-body-sm text-muted">
                    Transfer até o terminal ou destino. Você detalha frequência e horários depois, no painel.
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { v: true, label: "Sim, tenho transfer" },
                    { v: false, label: "Não ofereço" },
                  ].map((opt) => (
                    <button
                      key={String(opt.v)}
                      type="button"
                      onClick={() => setHasShuttle(opt.v)}
                      className={
                        "flex items-center gap-2 rounded-md border p-4 text-left text-body-sm transition " +
                        (hasShuttle === opt.v
                          ? "border-mp-primary bg-mp-pale text-mp-indigo"
                          : "border-hairline bg-canvas text-ink hover:border-mp-primary/50")
                      }
                    >
                      <BusFront className="h-5 w-5 shrink-0" />
                      {opt.label}
                    </button>
                  ))}
                </div>
                <div className="rounded-md bg-surface-pale p-4">
                  <p className="flex items-center gap-2 text-body-sm text-ink">
                    <Sparkles className="h-4 w-4 text-mp-violet" /> Pronto pra publicar. Você deixa a
                    unidade redonda (fotos, comodidades, horários) depois, no painel.
                  </p>
                </div>
              </div>
            )}

            {/* navegação */}
            <div className="mt-6 flex items-center justify-between gap-2 border-t border-hairline pt-5">
              {step > 1 ? (
                <Button variant="ghost" onClick={() => setStep((s) => s - 1)} disabled={busy}>
                  <ArrowLeft className="h-4 w-4" /> Voltar
                </Button>
              ) : (
                <span />
              )}
              {step === 1 && (
                <Button onClick={goFromAddress} disabled={busy}>
                  Continuar <ArrowRight className="h-4 w-4" />
                </Button>
              )}
              {step === 2 && (
                <Button onClick={goFromDestination} disabled={busy}>
                  Continuar <ArrowRight className="h-4 w-4" />
                </Button>
              )}
              {step === 3 && (
                <Button onClick={goFromParkingTypes} disabled={busy}>
                  Continuar <ArrowRight className="h-4 w-4" />
                </Button>
              )}
              {step === 4 && (
                <Button onClick={doPublish} disabled={busy}>
                  {busy ? "Publicando…" : "Publicar minha unidade"} <ArrowRight className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Coluna do preview vivo */}
        <aside className="hidden desktop:block">
          <div className="sticky top-12 flex flex-col gap-3">
            <p className="text-caption-sm uppercase tracking-wide text-muted-steel">
              Como o cliente vai ver
            </p>
            <UnitPreviewCard
              name={name}
              address={address}
              destinationName={destName}
              hasShuttle={hasShuttle}
              items={previewItems}
            />
          </div>
        </aside>
      </div>
    </div>
  );
}
