import { AppShell } from "@/components/shared/AppShell";
import { OperatorAssistantWidget } from "@/features/operator-assistant/OperatorAssistantWidget";

export default function OperatorLayout() {
  return (
    <>
      <AppShell variant="operator" brandTitle="Operação" />
      {/* A Mia para operadores (docs/specs/assistente-do-operador.md). */}
      <OperatorAssistantWidget />
    </>
  );
}
