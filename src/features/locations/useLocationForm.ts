import * as React from "react";
import { toast } from "sonner";
import { useCreateLocation, useUpdateLocation } from "./api";
import type { EntityStatus, Location } from "@/types/domain";

/** Minutos do traslado: inteiro positivo ou null (vazio/0/negativo → null, casa com o CHECK do banco). */
export function parsePositiveInt(value: string): number | null {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function slugify(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

type Options = {
  companyId: string;
  location: Location | null;
  /** `operator` esconde os campos de catálogo (slug, status, fuso, âncora, WPS). */
  operatorMode: boolean;
  onSaved: () => void;
};

/**
 * Estado e submit do formulário de localização, separados da apresentação.
 *
 * Existe porque o mesmo formulário é montado de dois jeitos: página no painel do
 * parceiro (`/operator/locations/:id/editar`) e dialog no manager, que ainda
 * precisa do modal para CRIAR uma unidade a partir da empresa.
 */
export function useLocationForm({ companyId, location, operatorMode, onSaved }: Options) {
  const create = useCreateLocation();
  const update = useUpdateLocation();
  const isEdit = !!location;

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
  const [externalRef, setExternalRef] = React.useState("");

  const reset = React.useCallback(() => {
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
      location?.shuttle_frequency_minutes != null ? String(location.shuttle_frequency_minutes) : "",
    );
    setShuttleToTerminal(
      location?.shuttle_to_terminal_minutes != null
        ? String(location.shuttle_to_terminal_minutes)
        : "",
    );
    setReservationPolicy(location?.reservation_policy ?? "");
    setDestinationId(location?.destination_id ?? null);
    setPhotos(Array.isArray(location?.photos) ? (location.photos as string[]) : []);
    setExternalRef(location?.external_ref ?? "");
  }, [location]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();

    // Foto obrigatória para vender: o parceiro não salva a unidade sem pelo menos 1 foto. O gate
    // no banco (is_listed) já impede a listagem sem foto; aqui a barreira é no próprio form, na voz
    // do operador. O manager (staff) segue livre para salvar rascunho sem foto.
    if (operatorMode && photos.length === 0) {
      toast.error("Adicione pelo menos 1 foto da unidade. Sem foto, ela não entra na busca.");
      return;
    }

    // Conteúdo "Como chegar" (PRD-11): passo-a-passo + traslado honesto (frequência/tempo).
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
      external_ref: externalRef.trim() || null,
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
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar");
    }
  }

  return {
    isEdit,
    operatorMode,
    submitting: create.isPending || update.isPending,
    reset,
    submit,
    fields: {
      name,
      setName,
      slug,
      setSlug,
      address,
      setAddress,
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
      setDestinationId,
      photos,
      setPhotos,
      externalRef,
      setExternalRef,
    },
  };
}

export type LocationFormApi = ReturnType<typeof useLocationForm>;
