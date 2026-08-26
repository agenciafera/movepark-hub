import { AppShell } from "@/components/shared/AppShell";
import { ManagerFilterProvider } from "@/features/manager-filters/ManagerFilterProvider";
import { MiaTestWidget } from "@/features/mia/MiaTestWidget";

export default function ManagerLayout() {
  // O provider fica no shell pra o recorte (período + unidade) acompanhar a
  // navegação entre as telas do painel em vez de zerar a cada página.
  return (
    <ManagerFilterProvider>
      <AppShell variant="manager" brandTitle="Backoffice" />
      {/* Ferramenta de time: só aparece para hub_admin. A conversa passa pela Edge `mia-chat`. */}
      <MiaTestWidget />
    </ManagerFilterProvider>
  );
}
