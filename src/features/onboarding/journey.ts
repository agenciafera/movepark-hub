import * as React from "react";
import { useOperatorLocations } from "@/features/locations/api";
import { useRecipient } from "@/features/payouts/api";
import type { JourneyStage } from "@/components/shared/OnboardingJourney";

/**
 * Estágio da jornada do parceiro (pós-aprovação do lead), derivado dos dados vivos da empresa.
 * Alimenta a trilha "Sua jornada na Movepark" em todo o processo:
 *   - Publicar   → tem unidade ativa
 *   - Recebimento→ recebedor apto (payout_recipient.status = 'active')
 *   - Fotos      → tem ao menos 1 foto em alguma unidade (regra: sem foto não vende)
 * `complete` = as três concluídas (aí a trilha some, o parceiro virou vendedor normal).
 */
export type JourneyStatus = {
  loading: boolean;
  complete: boolean;
  current: JourneyStage;
  completed: JourneyStage[];
  hasPublished: boolean;
  canReceive: boolean;
  /** recebimento enviado, aguardando a Movepark aprovar (pending / action_required). */
  recebimentoPending: boolean;
  hasPhotos: boolean;
  /** unidade efetivamente no ar / vendendo (is_listed). */
  isListed: boolean;
};

const ORDER: JourneyStage[] = ["preview", "recebimento", "fotos", "vender"];

/** Lógica pura da jornada (testável sem React/Query). */
export function deriveJourney(input: {
  loading: boolean;
  hasPublished: boolean;
  recipientStatus: string | null;
  hasPhotos: boolean;
  isListed: boolean;
}): JourneyStatus {
  const canReceive = input.recipientStatus === "active";
  const recebimentoPending =
    input.recipientStatus === "pending" || input.recipientStatus === "action_required";

  const completed: JourneyStage[] = [];
  if (input.hasPublished) completed.push("preview");
  if (canReceive) completed.push("recebimento");
  if (input.hasPhotos) completed.push("fotos");
  if (input.isListed) completed.push("vender");

  const current = ORDER.find((s) => !completed.includes(s)) ?? "vender";
  const complete = input.isListed;

  return {
    loading: input.loading,
    complete,
    current,
    completed,
    hasPublished: input.hasPublished,
    canReceive,
    recebimentoPending,
    hasPhotos: input.hasPhotos,
    isListed: input.isListed,
  };
}

export function useOnboardingJourney(companyId: string | undefined): JourneyStatus {
  const locations = useOperatorLocations(companyId ? [companyId] : undefined);
  const recipient = useRecipient(companyId);

  return React.useMemo(() => {
    const locs = locations.data ?? [];
    return deriveJourney({
      loading: locations.isLoading || recipient.isLoading,
      hasPublished: locs.some((l) => l.status === "active"),
      hasPhotos: locs.some((l) => Array.isArray(l.photos) && l.photos.length >= 1),
      isListed: locs.some((l) => l.is_listed === true),
      recipientStatus: recipient.data?.status ?? null,
    });
  }, [locations.isLoading, locations.data, recipient.isLoading, recipient.data]);
}
