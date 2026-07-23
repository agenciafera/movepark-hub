import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Voltar padrão da área administrativa. É um LINK de texto, não um botão: voltar
 * é navegação, não ação primária, e um botão competiria com o "Nova X" da página.
 * Fica acima do título (posição de breadcrumb) e o rótulo nomeia o destino
 * ("Voltar para Unidades"), pra o operador saber para onde vai antes de clicar.
 *
 * Use via a prop `back` do PageHeader nas telas com cabeçalho; use direto só nas
 * telas que não têm PageHeader (ex.: as de conclusão do onboarding).
 */
export function BackLink({
  to,
  label,
  className,
}: {
  to: string;
  label: string;
  className?: string;
}) {
  return (
    <Link
      to={to}
      className={cn(
        "inline-flex w-fit items-center gap-1.5 rounded-sm text-body-sm text-muted transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2",
        className,
      )}
    >
      <ArrowLeft className="h-4 w-4 shrink-0" />
      {label}
    </Link>
  );
}
