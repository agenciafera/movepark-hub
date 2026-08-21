import * as React from "react";
import { toast } from "sonner";
import { useCreateLocation, useUpdateLocation } from "./api";
import {
  emptyBusinessHours,
  hasAnyHours,
  parseBusinessHours,
  type BusinessHours,
} from "./businessHours";
import { useLocationAmenities, useSetLocationAmenities } from "@/features/amenities/api";
import type { EntityStatus, Location } from "@/types/domain";

/** Minutos do traslado: inteiro positivo ou null (vazio/0/negativo → null, casa com o CHECK do banco). */
export function parsePositiveInt(value: string): number | null {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Um número de minutos válido é campo vazio (sem transfer) ou um inteiro positivo. */
export function isValidMinutes(value: string): boolean {
  return value.trim() === "" || parsePositiveInt(value) !== null;
}

/**
 * Normaliza referência opcional para o banco: string vazia vira `null`. `??` NÃO pega string
 * vazia, só null e undefined, e uma coluna `uuid` recusa `""` com `22P02`.
 *
 * ATENÇÃO: isto sozinho NÃO conserta a corrida do destino, e aplicá-lo sozinho é PIOR que o bug.
 * Medido em 19/08/2026: converter o `""` para `null` fez o UPDATE passar com 200 e APAGAR o
 * `destination_id` da unidade. O `22P02` era um fusível, não o defeito: ele estava impedindo uma
 * escrita destrutiva. Quem protege o dado é `destinationTouched` (ver o payload abaixo).
 */
export function uuidOuNulo(value: string | null | undefined): string | null {
  const v = (value ?? "").trim();
  return v === "" ? null : v;
}

/**
 * Traduz o erro do Postgres para a tela. Só trata o que a pessoa consegue resolver sozinha; o
 * resto continua genérico, porque texto técnico em inglês não ajuda quem está cadastrando.
 */
export function mensagemDeErro(err: unknown): string {
  const code = (err as { code?: string } | null)?.code;
  if (code === "22P02") {
    return "Algum campo de seleção ficou vazio. Confira o destino e tente salvar de novo.";
  }
  if (code === "23505") {
    return "Já existe uma unidade com esse endereço curto (slug). Troque e salve de novo.";
  }
  return "Não conseguimos salvar. Tente de novo em instantes.";
}

/**
 * Minutos onde ZERO é resposta legítima (tolerância de saída: 0 = sem tolerância).
 * Diferente de `parsePositiveInt`, que trata 0 como ausência. Vazio e lixo viram 0.
 */
export function parseNonNegativeInt(value: string): number {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Tolerância de saída que uma unidade NOVA já nasce oferecendo, espelhando o default
 * da coluna no banco (86ajp6vrq). Precisa estar aqui porque o formulário sempre manda
 * um valor explícito no insert: sem semear, unidade criada pela tela gravaria 0 e
 * atropelaria o default do banco, quebrando a promessa da FAQ global.
 */
export const DEFAULT_TOLERANCE_MINUTES = 60;

/**
 * Link de Maps a partir de um Place ID. Deep link documentado do Google para
 * abrir um lugar pelo identificador. Usado para pré-preencher o campo de negócio
 * quando o autocomplete traz o place_id; o parceiro pode trocar por um link próprio.
 */
export function googleMapsUrlFromPlaceId(placeId: string): string {
  return `https://www.google.com/maps/place/?q=place_id:${placeId}`;
}

export function slugify(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Campos que a validação e a âncora de erro conhecem. */
export type LocationFieldError = "name" | "shuttleFrequency" | "shuttleToTerminal" | "photos";

type Options = {
  companyId: string;
  location: Location | null;
  /** `operator` esconde os campos de catálogo (slug, status, fuso, âncora, WPS). */
  operatorMode: boolean;
  onSaved: () => void;
};

/** Todos os valores editáveis, no formato do estado (strings), para comparar sujo e semear. */
type Snapshot = {
  name: string;
  slug: string;
  address: string;
  addressComplement: string;
  googlePlaceId: string;
  googleMapsUrl: string;
  is24h: boolean;
  businessHours: BusinessHours;
  toleranceMinutes: string;
  timezone: string;
  status: EntityStatus;
  phone: string;
  email: string;
  notice: string;
  directionsText: string;
  shuttleFrequency: string;
  shuttleToTerminal: string;
  reservationPolicy: string;
  destinationId: string | null;
  latitude: number | null;
  longitude: number | null;
  photos: string[];
  externalRef: string;
  amenities: string[];
};

/**
 * Estado e submit do formulário de localização, separados da apresentação.
 *
 * Montado de dois jeitos: página no painel do parceiro (`/operator/locations/:id/editar`)
 * e dialog no manager, que ainda cria unidade a partir da empresa.
 */
export function useLocationForm({ companyId, location, operatorMode, onSaved }: Options) {
  const create = useCreateLocation();
  const update = useUpdateLocation();
  const setAmenities = useSetLocationAmenities();
  const isEdit = !!location;

  // Amenidades moram em `location_amenity`, não na `location`; query e escrita próprias.
  // O formulário trata as duas como um salvamento só, porque é a mesma unidade.
  const amenitiesQuery = useLocationAmenities(location?.id);
  const amenitiesData = amenitiesQuery.data;

  const [name, setName] = React.useState("");
  const [slug, setSlug] = React.useState("");
  const [address, setAddress] = React.useState("");
  const [addressComplement, setAddressComplement] = React.useState("");
  const [googlePlaceId, setGooglePlaceId] = React.useState("");
  const [googleMapsUrl, setGoogleMapsUrl] = React.useState("");
  const [is24h, setIs24h] = React.useState(true);
  const [businessHours, setBusinessHours] = React.useState<BusinessHours>(emptyBusinessHours);
  const [toleranceMinutes, setToleranceMinutes] = React.useState("");
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
  // A pessoa mexeu no campo de destino nesta sessão de edição? Só `onValueChange` liga isto, e é
  // o que separa "escolheu Nenhum" de "o formulário perdeu o valor sozinho".
  const [destinationTouched, setDestinationTouched] = React.useState(false);
  const [latitude, setLatitude] = React.useState<number | null>(null);
  const [longitude, setLongitude] = React.useState<number | null>(null);
  const [photos, setPhotos] = React.useState<string[]>([]);
  const [externalRef, setExternalRef] = React.useState("");
  const [amenities, setAmenities_] = React.useState<string[]>([]);
  const [errors, setErrors] = React.useState<Partial<Record<LocationFieldError, string>>>({});

  // Fonte única do "estado original": `reset` aplica isto e `isDirty` compara com
  // isto. Deriva de `location` (+ amenidades) do mesmo jeito, então os dois nunca
  // divergem, que era o risco de manter duas cópias da conversão.
  const baseline = React.useMemo<Snapshot>(
    () => ({
      name: location?.name ?? "",
      slug: location?.slug ?? "",
      address: location?.address ?? "",
      addressComplement: location?.address_complement ?? "",
      googlePlaceId: location?.google_place_id ?? "",
      googleMapsUrl: location?.google_maps_url ?? "",
      is24h: location?.is_24h ?? true,
      businessHours: parseBusinessHours(location?.business_hours ?? null),
      // Unidade nova nasce com o padrão da plataforma, visível pra ser ajustado. Em
      // unidade existente, 0 (sem tolerância) aparece como vazio, que lê melhor que "0".
      toleranceMinutes: location
        ? location.tolerance_minutes
          ? String(location.tolerance_minutes)
          : ""
        : String(DEFAULT_TOLERANCE_MINUTES),
      timezone: location?.timezone ?? "America/Sao_Paulo",
      status: (location?.status ?? "active") as EntityStatus,
      phone: location?.phone ?? "",
      email: location?.email ?? "",
      notice: location?.notice ?? "",
      directionsText: location?.directions_text ?? "",
      shuttleFrequency:
        location?.shuttle_frequency_minutes != null
          ? String(location.shuttle_frequency_minutes)
          : "",
      shuttleToTerminal:
        location?.shuttle_to_terminal_minutes != null
          ? String(location.shuttle_to_terminal_minutes)
          : "",
      reservationPolicy: location?.reservation_policy ?? "",
      destinationId: location?.destination_id ?? null,
      latitude: location?.latitude ?? null,
      longitude: location?.longitude ?? null,
      photos: Array.isArray(location?.photos) ? (location.photos as string[]) : [],
      externalRef: location?.external_ref ?? "",
      amenities: amenitiesData ?? [],
    }),
    [location, amenitiesData],
  );

  const reset = React.useCallback(() => {
    setName(baseline.name);
    setSlug(baseline.slug);
    setAddress(baseline.address);
    setAddressComplement(baseline.addressComplement);
    setGooglePlaceId(baseline.googlePlaceId);
    setGoogleMapsUrl(baseline.googleMapsUrl);
    setIs24h(baseline.is24h);
    setBusinessHours(baseline.businessHours);
    setToleranceMinutes(baseline.toleranceMinutes);
    setTimezone(baseline.timezone);
    setStatus(baseline.status);
    setPhone(baseline.phone);
    setEmail(baseline.email);
    setNotice(baseline.notice);
    setDirectionsText(baseline.directionsText);
    setShuttleFrequency(baseline.shuttleFrequency);
    setShuttleToTerminal(baseline.shuttleToTerminal);
    setReservationPolicy(baseline.reservationPolicy);
    setDestinationId(baseline.destinationId);
    setDestinationTouched(false);
    setLatitude(baseline.latitude);
    setLongitude(baseline.longitude);
    setPhotos(baseline.photos);
    setExternalRef(baseline.externalRef);
    setErrors({});
    // amenidades chegam depois (query própria); o efeito abaixo semeia quando vierem.
  }, [baseline]);

  // Semeia as amenidades quando a query responde, só por id, pra não sobrescrever
  // marcação feita durante o carregamento.
  React.useEffect(() => {
    if (amenitiesData) setAmenities_(amenitiesData);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location?.id, !!amenitiesData]);

  const current: Snapshot = {
    name,
    slug,
    address,
    addressComplement,
    googlePlaceId,
    googleMapsUrl,
    is24h,
    businessHours,
    toleranceMinutes,
    timezone,
    status,
    phone,
    email,
    notice,
    directionsText,
    shuttleFrequency,
    shuttleToTerminal,
    reservationPolicy,
    destinationId,
    latitude,
    longitude,
    photos,
    externalRef,
    amenities,
  };

  // Compara ordenando amenidades (ordem não importa) e mantendo a de fotos (a
  // primeira é a capa). Sujo = o que está na tela difere do estado original.
  const norm = (s: Snapshot) =>
    JSON.stringify({ ...s, photos: [...s.photos], amenities: [...s.amenities].sort() });
  const isDirty = norm(current) !== norm(baseline);

  /** Validação no submit. Devolve o mapa de erros (vazio = pode salvar). */
  function validate(): Partial<Record<LocationFieldError, string>> {
    const next: Partial<Record<LocationFieldError, string>> = {};
    if (name.trim() === "") next.name = "Dê um nome para a unidade.";
    if (!isValidMinutes(shuttleFrequency))
      next.shuttleFrequency = "Use um número de minutos, por exemplo 15.";
    if (!isValidMinutes(shuttleToTerminal))
      next.shuttleToTerminal = "Use um número de minutos, por exemplo 6.";
    // Foto obrigatória no operator: o gate do banco (is_listed) já barra a
    // listagem sem foto; aqui a barreira é na voz do operador. Manager salva rascunho.
    if (operatorMode && photos.length === 0)
      next.photos = "Suba pelo menos 1 foto. Sem foto, a unidade não entra na busca.";
    return next;
  }

  // Ordem em que a âncora procura o primeiro campo com erro, e onde ele mora no DOM.
  const errorAnchor: Record<LocationFieldError, string> = {
    name: "name",
    shuttleFrequency: "shuttle-freq",
    shuttleToTerminal: "shuttle-terminal",
    photos: "photos-field",
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();

    const found = validate();
    setErrors(found);
    const first = (Object.keys(errorAnchor) as LocationFieldError[]).find((k) => found[k]);
    if (first) {
      const el = document.getElementById(errorAnchor[first]);
      el?.scrollIntoView({ block: "center", behavior: "smooth" });
      // O bloco de fotos não é focável; o campo de texto é.
      if (el instanceof HTMLElement && typeof el.focus === "function")
        el.focus({ preventScroll: true });
      return;
    }

    const arrivalFields = {
      directions_text: directionsText.trim() || null,
      shuttle_frequency_minutes: parsePositiveInt(shuttleFrequency),
      shuttle_to_terminal_minutes: parsePositiveInt(shuttleToTerminal),
    };

    const fullPayload = {
      name,
      slug: slug || slugify(name),
      address: address || null,
      address_complement: addressComplement.trim() || null,
      google_place_id: googlePlaceId.trim() || null,
      google_maps_url: googleMapsUrl.trim() || null,
      is_24h: is24h,
      business_hours: is24h || !hasAnyHours(businessHours) ? null : businessHours,
      tolerance_minutes: parseNonNegativeInt(toleranceMinutes),
      timezone,
      status,
      phone: phone || null,
      email: email || null,
      notice: notice || null,
      reservation_policy: reservationPolicy || null,
      has_notice: !!notice,
      destination_id: uuidOuNulo(destinationId),
      company_id: companyId,
      external_ref: externalRef.trim() || null,
      latitude,
      longitude,
      photos,
      ...arrivalFields,
    };

    // O operador também salva a geo: o `geog` (ADR-001) é coluna gerada de
    // lat/lng, então gravar as coordenadas do Places mantém a proximidade em dia.
    // O destino (âncora) continua fora, que é do manager.
    const operatorPatch = {
      name,
      address: address || null,
      address_complement: addressComplement.trim() || null,
      google_place_id: googlePlaceId.trim() || null,
      google_maps_url: googleMapsUrl.trim() || null,
      is_24h: is24h,
      business_hours: is24h || !hasAnyHours(businessHours) ? null : businessHours,
      tolerance_minutes: parseNonNegativeInt(toleranceMinutes),
      phone: phone || null,
      email: email || null,
      notice: notice || null,
      reservation_policy: reservationPolicy || null,
      has_notice: !!notice,
      latitude,
      longitude,
      photos,
      ...arrivalFields,
    };

    // Na EDIÇÃO, `destination_id` só vai ao banco se a pessoa mexeu no campo nesta sessão.
    //
    // O motivo é que o valor pode se perder sem ninguém tocar nele: a lista de destinos chega por
    // consulta separada, e enquanto ela não monta os itens o Radix não acha o valor atual e limpa
    // a seleção. Mandar esse estado perdido apaga o vínculo da unidade com o aeroporto, que é o
    // que alimenta distância, ordenação por proximidade e a FAQ de destino (ADR-001, ADR-002).
    //
    // Omitir a chave é diferente de mandar null: o PostgREST só escreve o que recebe, então a
    // coluna fica como está. Escolher "Nenhum" continua funcionando, porque aí `touched` é true.
    const patchDoManager = { ...fullPayload };
    if (!destinationTouched) {
      delete (patchDoManager as { destination_id?: string | null }).destination_id;
    }

    try {
      let savedId: string;
      if (isEdit && location) {
        await update.mutateAsync({
          id: location.id,
          patch: operatorMode ? operatorPatch : patchDoManager,
        });
        savedId = location.id;
      } else {
        const criada = await create.mutateAsync(fullPayload);
        savedId = criada.id;
      }

      // Depois da unidade existir, e não antes: numa criação o id só nasce aqui.
      await setAmenities.mutateAsync({ locationId: savedId, codes: amenities });

      toast.success(isEdit ? "Unidade atualizada" : "Unidade criada");
      onSaved();
    } catch (err) {
      // O erro cru do PostgREST/Postgres é técnico e em inglês; não vai pra tela. Mas "tente de
      // novo" sozinho escondeu por meses um erro que NUNCA ia passar na segunda tentativa (o
      // 22P02 do destination_id vazio), então a mensagem agora diz o que dá pra fazer quando a
      // causa é conhecida.
      console.error("Falha ao salvar localização:", err);
      toast.error(mensagemDeErro(err));
    }
  }

  return {
    isEdit,
    operatorMode,
    submitting: create.isPending || update.isPending || setAmenities.isPending,
    isDirty,
    errors,
    reset,
    submit,
    fields: {
      name,
      setName,
      slug,
      setSlug,
      address,
      setAddress,
      addressComplement,
      setAddressComplement,
      googlePlaceId,
      setGooglePlaceId,
      googleMapsUrl,
      setGoogleMapsUrl,
      is24h,
      setIs24h,
      businessHours,
      setBusinessHours,
      toleranceMinutes,
      setToleranceMinutes,
      timezone,
      setTimezone,
      status,
      setStatus,
      phone,
      setPhone,
      email,
      setEmail,
      notice,
      setNotice,
      directionsText,
      setDirectionsText,
      shuttleFrequency,
      setShuttleFrequency,
      shuttleToTerminal,
      setShuttleToTerminal,
      reservationPolicy,
      setReservationPolicy,
      destinationId,
      setDestinationId: (v: string | null) => {
        setDestinationTouched(true);
        setDestinationId(v);
      },
      latitude,
      setLatitude,
      longitude,
      setLongitude,
      photos,
      setPhotos,
      externalRef,
      setExternalRef,
      amenities,
      setAmenities: setAmenities_,
    },
  };
}

export type LocationFormApi = ReturnType<typeof useLocationForm>;
