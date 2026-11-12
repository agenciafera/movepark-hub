import { useParams } from "react-router-dom";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { useCompanies } from "@/features/companies/api";
import { RecoverableBookingsPanel } from "@/features/recovery/RecoverableBookingsPanel";

/**
 * Manager › Empresas › <empresa> › Não concluídas: a mesma lista do parceiro, vista pelo time
 * Movepark. O hub_admin passa no `bookings:recovery` da RPC, e a exportação fica registrada.
 */
export default function ManagerCompanyRecovery() {
  const { companyId } = useParams<{ companyId: string }>();
  const companies = useCompanies();
  const company = companies.data?.find((c) => c.id === companyId);

  if (!companyId) {
    return <EmptyState title="Empresa não informada" description="Abra a lista a partir de Empresas." />;
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={company ? `Não concluídas · ${company.name}` : "Reservas não concluídas"}
        description="Quem começou uma reserva, não pagou e ainda vai viajar. Uma linha por pessoa, sem quem já comprou depois."
        back={{ to: "/manager/companies", label: "Voltar para Empresas" }}
      />
      <RecoverableBookingsPanel
        companyId={companyId}
        bookingHref={(code) => `/manager/bookings/${code}`}
        filePrefix={company ? `nao-concluidas-${company.slug}` : "nao-concluidas"}
      />
    </div>
  );
}
