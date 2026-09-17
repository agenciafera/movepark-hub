import { AppShell } from "@/components/shared/AppShell";
import { ManagerFilterProvider } from "@/features/manager-filters/ManagerFilterProvider";

export default function ManagerLayout() {
  // O provider fica no shell pra o recorte (período + unidade) acompanhar a
  // navegação entre as telas do painel em vez de zerar a cada página.
  return (
    <ManagerFilterProvider>
      <AppShell variant="manager" brandTitle="Backoffice" />
      {/* A ferramenta de teste da Mia virou página (Conta › Testar a Mia, 17/09/2026): a bolinha
          flutuante cobria as tabelas. */}
    </ManagerFilterProvider>
  );
}
