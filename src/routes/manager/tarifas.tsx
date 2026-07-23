import { PageHeader } from "@/components/shared/PageHeader";
import { FareEditor } from "@/features/fares/FareEditor";

/** Editor global de tarifas (Básica/Flex/Superflex). Só Super Admin (rota hub_admin). */
export default function ManagerTarifas() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Tarifas"
        description="Preço, janela de cancelamento e benefícios de cada tarifa. Vale para toda a plataforma, em todos os estacionamentos. Só a equipe Movepark edita."
      />
      <FareEditor />
    </div>
  );
}
