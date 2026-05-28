import { Badge } from "@/components/ui/badge";
import type { BookingStatus } from "@/types/domain";

const labels: Record<BookingStatus, string> = {
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
  return <Badge tone={tones[status]}>{labels[status]}</Badge>;
}
