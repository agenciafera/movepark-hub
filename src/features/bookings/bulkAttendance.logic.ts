/**
 * Ação em massa na lista de reservas (fase 6 das reservas unificadas, 09/10/2026): marcar
 * "Cliente chegou" ou "Não veio" em várias reservas de uma vez, como o backoffice do white-label já
 * fazia. Vale para as duas origens, cada uma pela regra dela:
 *
 * - Hub: só reserva Confirmada (a mesma da tela da reserva: confirmada vira Em uso ou No-show).
 * - Site: só pedido pago no site e com as ações do white-label ligadas para quem está logado;
 *   "chegou" só a partir do horário de entrada, que é o que o site aceita (`canMarkArrived`).
 *
 * O resto é pulado e contado por motivo, para a tela dizer por que não marcou.
 */
import { canMarkArrived } from "@/features/wl-bookings/wlBooking.logic";
import type { UnifiedBookingRow } from "@/types/domain";

export type BulkAction = "arrived" | "no_show";

export type BulkStep =
  | { source: "hub"; id: string; code: string; status: "checked_in" | "no_show" }
  | { source: "wl"; id: string; code: string; attendance: "compareceu" | "no_show" };

export type SkipReason = "status" | "antes_do_horario" | "site_sem_permissao";

export type BulkPlan = { steps: BulkStep[]; skipped: Record<SkipReason, number> };

export function planBulkAttendance(
  rows: UnifiedBookingRow[],
  action: BulkAction,
  opts: { wlAttendance: boolean; now?: Date },
): BulkPlan {
  const skipped: Record<SkipReason, number> = { status: 0, antes_do_horario: 0, site_sem_permissao: 0 };
  const steps: BulkStep[] = [];
  for (const r of rows) {
    if (r.source === "hub") {
      if (r.booking.status !== "confirmed") {
        skipped.status++;
        continue;
      }
      steps.push({ source: "hub", id: r.booking.id, code: r.booking.code, status: action === "arrived" ? "checked_in" : "no_show" });
      continue;
    }
    if (!opts.wlAttendance) {
      skipped.site_sem_permissao++;
      continue;
    }
    if (r.wl.site_status !== "confirmed") {
      skipped.status++;
      continue;
    }
    if (action === "arrived" && !canMarkArrived(r.wl.check_in_at, opts.now)) {
      skipped.antes_do_horario++;
      continue;
    }
    steps.push({ source: "wl", id: r.wl.id, code: r.wl.wl_order_number, attendance: action === "arrived" ? "compareceu" : "no_show" });
  }
  return { steps, skipped };
}

/** Resumo para o aviso da tela: "3 marcadas. 2 puladas: 1 não estava confirmada, 1 antes do horário." */
export function bulkSummary(done: number, failed: number, skipped: Record<SkipReason, number>): string {
  const partes: string[] = [];
  partes.push(`${done} ${done === 1 ? "marcada" : "marcadas"}.`);
  if (failed > 0) partes.push(`${failed} não ${failed === 1 ? "gravou" : "gravaram"}.`);
  const motivos: string[] = [];
  if (skipped.status) motivos.push(`${skipped.status} não ${skipped.status === 1 ? "estava confirmada" : "estavam confirmadas"}`);
  if (skipped.antes_do_horario) motivos.push(`${skipped.antes_do_horario} antes do horário de entrada`);
  if (skipped.site_sem_permissao) motivos.push(`${skipped.site_sem_permissao} do site sem permissão para marcar`);
  const pulados = skipped.status + skipped.antes_do_horario + skipped.site_sem_permissao;
  if (pulados > 0) partes.push(`${pulados} ${pulados === 1 ? "pulada" : "puladas"}: ${motivos.join(", ")}.`);
  return partes.join(" ");
}
