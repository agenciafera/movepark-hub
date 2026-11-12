import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { useAuth } from "@/auth/context";
import { RecoverableBookingsPanel } from "@/features/recovery/RecoverableBookingsPanel";

/**
 * Operator › Não concluídas (12/11/2026): quem começou uma reserva, não pagou e ainda vai
 * viajar. Gateada por `bookings:recovery` na rota, na sidebar e na RPC (ADR-005).
 */
export default function OperatorRecovery() {
  const { scopedCompanyId, effectiveCompanyIds } = useAuth();
  const companyId = scopedCompanyId ?? effectiveCompanyIds[0];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Reservas não concluídas"
        description="Quem começou uma reserva, não pagou e ainda vai viajar. Uma linha por pessoa, sem quem já comprou depois."
      />
      {companyId ? (
        <RecoverableBookingsPanel companyId={companyId} />
      ) : (
        <EmptyState title="Sem empresa vinculada" />
      )}
    </div>
  );
}
