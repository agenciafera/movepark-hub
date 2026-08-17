import * as React from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * O card dos painéis internos (Manager e Operator): cantos de 20px, superfície branca, sem borda.
 *
 * Estava duplicado, idêntico, no ManagerDashboard e no OperatorDashboard, e uma terceira cópia ia
 * nascer no marketing. Duplicar um card é como as telas do mesmo painel começam a divergir: uma
 * ganha borda, outra muda o padding, e em seis meses ninguém sabe qual é o padrão.
 *
 * `Panel` é o contêiner e `PanelTitle` o cabeçalho dele. O `aside` é a linha de contexto à direita
 * do título (o período, a unidade), em texto secundário: ela informa sem competir com o título.
 */
export function Panel({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <Card className={cn("rounded-lg border-transparent p-7", className)} {...props} />;
}

export function PanelTitle({
  children,
  aside,
}: {
  children: React.ReactNode;
  aside?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0 text-title-md text-ink">{children}</div>
      {aside && <div className="shrink-0 text-caption font-medium text-muted">{aside}</div>}
    </div>
  );
}
