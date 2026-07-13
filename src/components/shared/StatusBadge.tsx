import { Badge } from "@/components/ui/badge";
import type { BookingStatus } from "@/types/domain";

export const BOOKING_STATUS_LABELS: Record<BookingStatus, string> = {
  pending: "Pendente",
  confirmed: "Confirmada",
  checked_in: "Em uso",
  completed: "Concluída",
  cancelled: "Cancelada",
  no_show: "No-show",
};

const tones = {
  pending: "pending",
  confirmed: "confirmed",
  checked_in: "active",
  completed: "completed",
  cancelled: "cancelled",
  no_show: "cancelled",
} as const;

export function StatusBadge({ status }: { status: BookingStatus }) {
  return <Badge tone={tones[status]}>{BOOKING_STATUS_LABELS[status]}</Badge>;
}
