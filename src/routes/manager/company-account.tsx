import { useParams } from "react-router-dom";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { PartnerAccount } from "@/features/payouts/PartnerAccount";
import { useCompanies } from "@/features/companies/api";

/**
 * Manager › Empresas › <empresa> › Conta (E0.3.7): a conta bancária do estacionamento como a
 * Movepark a vê, com saque e estorno.
 */
export default function ManagerCompanyAccount() {
  const { companyId } = useParams<{ companyId: string }>();
  const companies = useCompanies();
  const company = companies.data?.find((c) => c.id === companyId);

  if (!companyId) {
    return <EmptyState title="Empresa não informada" description="Abra a conta a partir de Recebedores." />;
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={company ? `Conta · ${company.name}` : "Conta do estacionamento"}
        description="Saldo real no gateway, quando o dinheiro libera e vai para o banco, dívida e cada movimento com a reserva de origem."
        back={{ to: "/manager/finance/recipients", label: "Voltar para Recebedores" }}
      />
      <PartnerAccount companyId={companyId} canWithdraw canRefund />
    </div>
  );
}
