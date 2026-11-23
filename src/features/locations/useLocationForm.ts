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
/**
 * Na tela, Rascunho é um STATUS ao lado de Ativa/Inativa/Suspensa. No banco não: `status` é o
 * enum `entity_status`, compartilhado com empresa, e todo corte do catálogo checa
 * `status = 'active'`; o rascunho mora em `location.is_draft` (16/09/2026). Este par de
 * funções é a tradução, num lugar só: Rascunho = ativa por baixo, com `is_draft`.
 */
export type StatusField = EntityStatus | "draft";

export function statusFieldFrom(
  location: { status: EntityStatus; is_draft?: boolean } | null,
): StatusField {
  if (!location) return "active";
  if (location.status === "active" && location.is_draft) return "draft";
  return location.status;
}

export function statusFieldToPayload(value: StatusField): {
  status: EntityStatus;
  is_draft: boolean;
} {
  if (value === "draft") return { status: "active", is_draft: true };
  return { status: value, is_draft: false };
}

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

/**
 * Conversão do Google Ads da unidade: o id de conversão (só dígitos) e o rótulo da ação, a parte
 * depois da barra no snippet. As duas regex espelham as constraints do banco
 * (`location_ads_conversion_*_format`), para o erro aparecer na tela antes do 23514.
 *
 * O id é guardado **sem** o `AW-`, de propósito. O `AW-17302388529` que o Google mostra é o id da
 * tag (o id de destino); o campo "Código de conversão" da tag do GTM aceita só inteiro positivo e
 * recusa `AW-...` com "O valor precisa ser um número inteiro positivo ou 0". Como o valor chega
 * por variável de camada de dados, o GTM não valida na hora de salvar: a tag salva sem reclamar e
 * a conversão falha em runtime, sem erro em lugar nenhum. Foi o que aconteceu com as duas unidades
 * configuradas até 18/11/2026. Ver docs/specs/analytics-ecommerce.md §3.1.
 */
export const ADS_CONVERSION_ID_RE = /^[0-9]{6,}$/;
export const ADS_CONVERSION_LABEL_RE = /^[A-Za-z0-9_-]{4,}$/;

/**
 * Devolve só a parte numérica do id de conversão, ou null quando o texto não é um id.
 *
 * Aceita o que as telas do Google oferecem para copiar: `17302388529`, `AW-17302388529` (o id da
 * tag), o `send_to` inteiro (`AW-17302388529/AbCd_eFgH`) e qualquer um deles com espaço sobrando.
 * Recusa o que cai aqui por confusão: id de GA4 (`G-YWNH4G3PNV`), customer id com hífens
 * (`123-456-7890`) e número curto demais para ser id de conversão.
 */
export function normalizarIdConversaoAds(valor: unknown): string | null {
  const id = String(valor ?? "")
    .trim()
    .split("/")[0]
    .replace(/^AW-/i, "")
    .replace(/\s+/g, "");
  return ADS_CONVERSION_ID_RE.test(id) ? id : null;
}

/**
 * Devolve só o rótulo, ou null quando o texto não é um rótulo. É a mesma defesa do id na outra
 * ponta: quem cola o `send_to` inteiro (`AW-123/AbCd`) no campo do rótulo fica com o que está
 * depois da barra, que é o rótulo de verdade.
 */
export function normalizarRotuloConversaoAds(valor: unknown): string | null {
  const partes = String(valor ?? "")
    .trim()
    .split("/");
  const rotulo = partes[partes.length - 1].replace(/\s+/g, "");
  return ADS_CONVERSION_LABEL_RE.test(rotulo) ? rotulo : null;
}

/**
 * Aceita o snippet inteiro colado do Google Ads (`AW-326904374/EaA6CMu82aYbELbU8JsB`) e devolve
 * as duas partes, já normalizadas. Sem barra, devolve só o id. É o que deixa o campo de id
 * receber o que a tela de conversão do Ads oferece para copiar, sem a pessoa fatiar à mão nem
 * apagar o `AW-`.
 *
 * Cada parte só é trocada pela normalizada quando a normalização dá certo: `AW-17` no meio da
 * digitação continua na tela como a pessoa escreveu, em vez de sumir.
 */
export function splitAdsSnippet(raw: string): { id: string; label: string | null } {
  const value = raw.trim();
  const slash = value.indexOf("/");
  const idCru = slash === -1 ? value : value.slice(0, slash).trim();
  const id = normalizarIdConversaoAds(idCru) ?? idCru;
  if (slash === -1) return { id, label: null };
  const rotuloCru = value.slice(slash + 1).trim();
  return { id, label: normalizarRotuloConversaoAds(rotuloCru) ?? rotuloCru };
}

/**
 * Valida o par id + rótulo como o banco valida: os dois vazios (sem conversão de parceiro) ou os
 * dois preenchidos e no formato. Devolve a mensagem do primeiro problema, ou null.
 */
export function validateAdsConversion(id: string, label: string): string | null {
  const i = id.trim();
  const l = label.trim();
  if (i === "" && l === "") return null;
  if (i === "") return "Informe o ID de conversão junto com o rótulo.";
  if (l === "") return "Informe o rótulo junto com o ID de conversão.";
  if (normalizarIdConversaoAds(i) === null)
    return "O ID de conversão é só o número, como 17302388529. O AW-17302388529 é o ID da tag do Google, que é outra coisa.";
  if (normalizarRotuloConversaoAds(l) === null)
    return "O rótulo é a parte depois da barra no snippet, só letras, números, - e _.";
  return null;
}

/**
 * ID da métrica do GA4 do parceiro (`G-` + letras maiúsculas e dígitos), que recebe uma cópia dos
 * eventos da unidade. A regex espelha a constraint `location_ga4_measurement_id_format`.
 */
export const GA4_MEASUREMENT_ID_RE = /^G-[A-Z0-9]{6,}$/;

/**
 * Devolve o ID da métrica normalizado, ou null quando o texto não é um.
 *
 * Aceita o id como o GA4 mostra, com espaço sobrando e em minúsculas (quem digita de cabeça
 * escreve `g-ab12...`). Recusa o que cai aqui por confusão: id de tag do Google Ads (`AW-...`),
 * container do GTM (`GTM-...`), Universal Analytics (`UA-...`) e o id numérico da propriedade,
 * que aparece na mesma tela do GA4 e não serve para enviar evento.
 */
export function normalizarIdGa4(valor: unknown): string | null {
  const id = String(valor ?? "")
    .replace(/\s+/g, "")
    .toUpperCase();
  return GA4_MEASUREMENT_ID_RE.test(id) ? id : null;
}

/** Vazio passa (unidade sem GA4 de parceiro). Preenchido, tem que ser um ID da métrica. */
export function validateGa4MeasurementId(id: string): string | null {
  if (id.trim() === "") return null;
  if (normalizarIdGa4(id) === null)
    return "O ID do GA4 começa com G-, como G-AB12CD34EF. AW- é do Google Ads e GTM- é do Tag Manager.";
  return null;
}

/** Campos que a validação e a âncora de erro conhecem. */
export type LocationFieldError =
  | "name"
  | "shuttleFrequency"
  | "shuttleToTerminal"
  | "photos"
  | "adsConversion"
  | "ga4MeasurementId";

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
  /** Ativa, Inativa, Suspensa ou Rascunho (ver statusFieldFrom). */
  status: StatusField;
  phone: string;
  email: string;
  notice: string;
  directionsText: string;
  shuttleFrequency: string;
  shuttleToTerminal: string;
  reservationPolicy: string;
  /** Aviso do estacionamento (Markdown restrito), docs/specs/aviso-do-estacionamento.md. */
  partnerNotice: string;
  destinationId: string | null;
  latitude: number | null;
  longitude: number | null;
  photos: string[];
  externalRef: string;
  amenities: string[];
  /** Conversão do Google Ads por unidade (Manager): id da conta e rótulo da ação. */
  adsConversionId: string;
  adsConversionLabel: string;
  /** ID da métrica do GA4 do parceiro (Manager): recebe cópia dos eventos da unidade. */
  ga4MeasurementId: string;
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
  const [status, setStatus] = React.useState<StatusField>("active");
  const [phone, setPhone] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [notice, setNotice] = React.useState("");
  const [directionsText, setDirectionsText] = React.useState("");
  const [shuttleFrequency, setShuttleFrequency] = React.useState("");
  const [shuttleToTerminal, setShuttleToTerminal] = React.useState("");
  const [reservationPolicy, setReservationPolicy] = React.useState("");
  const [partnerNotice, setPartnerNotice] = React.useState("");
  const [destinationId, setDestinationId] = React.useState<string | null>(null);
  // A pessoa mexeu no campo de destino nesta sessão de edição? Só `onValueChange` liga isto, e é
  // o que separa "escolheu Nenhum" de "o formulário perdeu o valor sozinho".
  const [destinationTouched, setDestinationTouched] = React.useState(false);
  const [latitude, setLatitude] = React.useState<number | null>(null);
  const [longitude, setLongitude] = React.useState<number | null>(null);
  const [photos, setPhotos] = React.useState<string[]>([]);
  const [externalRef, setExternalRef] = React.useState("");
  const [amenities, setAmenities_] = React.useState<string[]>([]);
  const [adsConversionId, setAdsConversionId] = React.useState("");
  const [adsConversionLabel, setAdsConversionLabel] = React.useState("");
  const [ga4MeasurementId, setGa4MeasurementId] = React.useState("");
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
      // `is_draft` ainda não está em `database.ts` (o `gen types` vem saindo incompleto); lido por cast.
      status: statusFieldFrom(
        location
          ? {
              status: location.status as EntityStatus,
              is_draft: (location as { is_draft?: boolean }).is_draft,
            }
          : null,
      ),
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
      partnerNotice: location?.partner_notice_md ?? "",
      destinationId: location?.destination_id ?? null,
      latitude: location?.latitude ?? null,
      longitude: location?.longitude ?? null,
      photos: Array.isArray(location?.photos) ? (location.photos as string[]) : [],
      externalRef: location?.external_ref ?? "",
      amenities: amenitiesData ?? [],
      adsConversionId: location?.ads_conversion_id ?? "",
      adsConversionLabel: location?.ads_conversion_label ?? "",
      ga4MeasurementId: location?.ga4_measurement_id ?? "",
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
    setPartnerNotice(baseline.partnerNotice);
    setDestinationId(baseline.destinationId);
    setDestinationTouched(false);
    setLatitude(baseline.latitude);
    setLongitude(baseline.longitude);
    setPhotos(baseline.photos);
    setExternalRef(baseline.externalRef);
    setAdsConversionId(baseline.adsConversionId);
    setAdsConversionLabel(baseline.adsConversionLabel);
    setGa4MeasurementId(baseline.ga4MeasurementId);
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
    partnerNotice,
    destinationId,
    latitude,
    longitude,
    photos,
    externalRef,
    amenities,
    adsConversionId,
    adsConversionLabel,
    ga4MeasurementId,
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
    // Só o Manager vê e manda os campos de conversão; no operator eles nem entram no patch.
    if (!operatorMode) {
      const ads = validateAdsConversion(adsConversionId, adsConversionLabel);
      if (ads) next.adsConversion = ads;
      const ga4 = validateGa4MeasurementId(ga4MeasurementId);
      if (ga4) next.ga4MeasurementId = ga4;
    }
    return next;
  }

  // Ordem em que a âncora procura o primeiro campo com erro, e onde ele mora no DOM.
  const errorAnchor: Record<LocationFieldError, string> = {
    name: "name",
    shuttleFrequency: "shuttle-freq",
    shuttleToTerminal: "shuttle-terminal",
    photos: "photos-field",
    adsConversion: "ads-conversion-id",
    ga4MeasurementId: "ga4-measurement-id",
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
      ...statusFieldToPayload(status),
      phone: phone || null,
      email: email || null,
      notice: notice || null,
      reservation_policy: reservationPolicy || null,
      partner_notice_md: partnerNotice.trim() || null,
      has_notice: !!notice,
      destination_id: uuidOuNulo(destinationId),
      company_id: companyId,
      external_ref: externalRef.trim() || null,
      // Os dois vazios viram null juntos (constraint `location_ads_conversion_pair`); a validação
      // acima já garantiu que não vai metade. A normalização aqui é a que vale: o campo aceita o
      // `AW-` e o snippet inteiro, o banco recebe só o número, que é o que o GTM sabe ler.
      ads_conversion_id: normalizarIdConversaoAds(adsConversionId),
      ads_conversion_label: normalizarRotuloConversaoAds(adsConversionLabel),
      // Vazio vira null; preenchido vai em maiúsculas, que é como a constraint aceita.
      ga4_measurement_id: normalizarIdGa4(ga4MeasurementId),
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
      partner_notice_md: partnerNotice.trim() || null,
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
      partnerNotice,
      setPartnerNotice,
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
      adsConversionId,
      /**
       * Colar o snippet inteiro (`AW-123/rótulo`) no campo de id preenche os dois: é o que a
       * tela do Google Ads oferece para copiar, e fatiar à mão é onde o rótulo se perde.
       */
      setAdsConversionId: (v: string) => {
        const parts = splitAdsSnippet(v);
        setAdsConversionId(parts.id);
        if (parts.label) setAdsConversionLabel(parts.label);
      },
      adsConversionLabel,
      /**
       * Mesma defesa do id: quem cola o `send_to` inteiro aqui fica com o que está depois da
       * barra, em vez de gravar `AW-123/AbCd` como rótulo.
       */
      setAdsConversionLabel: (v: string) => {
        setAdsConversionLabel(normalizarRotuloConversaoAds(v) ?? v);
      },
      ga4MeasurementId,
      /** Normaliza quando o texto já é um id; no meio da digitação fica como a pessoa escreveu. */
      setGa4MeasurementId: (v: string) => {
        setGa4MeasurementId(normalizarIdGa4(v) ?? v);
      },
    },
  };
}

export type LocationFormApi = ReturnType<typeof useLocationForm>;
