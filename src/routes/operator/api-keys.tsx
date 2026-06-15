import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { useAuth } from "@/auth/context";
import { ApiKeysTable } from "@/features/api-keys/ApiKeysTable";

export default function OperatorApiKeys() {
  const { effectiveCompanyIds } = useAuth();
  const companyId = effectiveCompanyIds[0];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="API"
        description="Chaves de API para integrar seus sistemas (ex.: WPS) à Public API do Movepark. Veja a documentação em api.movepark.co/docs."
      />

      {!companyId ? (
        <EmptyState
          title="Sem empresa vinculada"
          description="Solicite à equipe Movepark a vinculação da sua empresa."
        />
      ) : (
        <ApiKeysTable companyId={companyId} />
      )}
    </div>
  );
}
