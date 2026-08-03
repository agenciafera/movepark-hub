import { Badge } from "@/components/ui/badge";
import type { BookingStatus, EntityStatus } from "@/types/domain";
import { BOOKING_STATUS_TONES } from "./statusBadge.logic";

export const BOOKING_STATUS_LABELS: Record<BookingStatus, string> = {
  pending: "Pendente",
  confirmed: "Confirmada",
  checked_in: "Em uso",
  completed: "Concluída",
  cancelled: "Cancelada",
  expired: "Expirada",
  no_show: "No-show",
};

export function StatusBadge({ status }: { status: BookingStatus }) {
  return <Badge tone={BOOKING_STATUS_TONES[status]}>{BOOKING_STATUS_LABELS[status]}</Badge>;
}


// Status de entidade (localização, empresa): active/inactive/suspended. Feminino
// porque concorda com "unidade"/"empresa".
const ENTITY_STATUS_LABELS: Record<EntityStatus, string> = {
  active: "Ativa",
  inactive: "Inativa",
  suspended: "Suspensa",
};

// `active` usa o tom `active` (pale-blue/indigo), o tom que o DESIGN.md nomeia
// para "Ativo". O manager pintava de `confirmed` (verde), divergindo do operator;
// aqui os dois passam a falar a mesma cor.
const entityTones: Record<EntityStatus, "active" | "pending" | "cancelled"> = {
  active: "active",
  inactive: "pending",
  suspended: "cancelled",
};

/**
 * Badge de status de localização ou empresa. `context` é o substantivo do rótulo
 * acessível ("Status da unidade: Ativa").
 */
export function EntityStatusBadge({
  status,
  context = "unidade",
}: {
  status: EntityStatus;
  context?: string;
}) {
  const label = ENTITY_STATUS_LABELS[status];
  return (
    <Badge tone={entityTones[status]} aria-label={`Status da ${context}: ${label}`}>
      {label}
    </Badge>
  );
}
