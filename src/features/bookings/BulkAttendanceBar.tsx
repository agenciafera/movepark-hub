import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useUpdateBookingStatus } from "./api";
import { useWlBookingAction } from "@/features/wl-bookings/api";
import { bulkSummary, planBulkAttendance, type BulkAction } from "./bulkAttendance.logic";
import type { UnifiedBookingRow } from "@/types/domain";

/**
 * Barra de ação em massa da lista de reservas (fase 6): "Cliente chegou" e "Não veio" nas
 * selecionadas. Quem decide o que entra é `planBulkAttendance`; o servidor confere de novo cada uma
 * (gatilho de escrita da reserva do Hub e a Edge `wl-booking-action` para o site).
 */
export function BulkAttendanceBar({
  rows,
  wlAttendance,
  onDone,
}: {
  rows: UnifiedBookingRow[];
  wlAttendance: boolean;
  onDone: () => void;
}) {
  const hubStatus = useUpdateBookingStatus();
  const wlAction = useWlBookingAction();
  const [busy, setBusy] = React.useState<BulkAction | null>(null);

  async function aplicar(action: BulkAction) {
    const plan = planBulkAttendance(rows, action, { wlAttendance });
    setBusy(action);
    let done = 0;
    let failed = 0;
    // Uma por vez: o site do parceiro grava pedido a pedido, e em paralelo uma recusa no meio
    // deixaria a contagem confusa.
    for (const step of plan.steps) {
      try {
        if (step.source === "hub") {
          await hubStatus.mutateAsync({
            bookingId: step.id,
            status: step.status,
            ...(step.status === "checked_in"
              ? { timestamp: { field: "checked_in_at" as const, value: new Date().toISOString() } }
              : {}),
          });
        } else {
          await wlAction.mutateAsync({
            action: "attendance",
            wlBookingId: step.id,
            status: step.attendance,
          });
        }
        done++;
      } catch {
        failed++;
      }
    }
    setBusy(null);
    const msg = bulkSummary(done, failed, plan.skipped);
    if (failed > 0 || done === 0) toast.warning(msg);
    else toast.success(msg);
    onDone();
  }

  return (
    <div
      className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-hairline bg-surface-soft px-4 py-3"
      data-testid="acao-em-massa"
    >
      <span className="text-body-sm text-ink">
        {rows.length} {rows.length === 1 ? "selecionada" : "selecionadas"}
      </span>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => aplicar("arrived")} disabled={busy !== null}>
          {busy === "arrived" ? "Marcando..." : "Cliente chegou"}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => aplicar("no_show")}
          disabled={busy !== null}
        >
          {busy === "no_show" ? "Marcando..." : "Não veio"}
        </Button>
        <Button size="sm" variant="ghost" onClick={onDone} disabled={busy !== null}>
          Limpar seleção
        </Button>
      </div>
    </div>
  );
}
