import { PageHeader } from "@/components/shared/PageHeader";
import { MiaTestWidget } from "@/features/mia/MiaTestWidget";

/**
 * Manager › Testar a Mia (17/09/2026): a ferramenta de teste do agente de WhatsApp como página,
 * no lugar da bolinha flutuante que cobria as tabelas. Só hub_admin vê o conteúdo (o widget
 * confere o papel; a Edge `mia-chat` confere de novo no servidor).
 */
export default function ManagerMia() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Testar a Mia"
        description="Conversa de teste com o agente de WhatsApp, sem número real e sem passar pela Evolution. Escolha um telefone e uma origem para começar."
      />
      <MiaTestWidget inline />
    </div>
  );
}
