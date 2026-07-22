import { cn } from "@/lib/utils";

type Props = {
  title: string;
  eyebrow?: string;
  description?: string;
  actions?: React.ReactNode;
  /**
   * "admin" (padrão): descrição em 14px muted, para as telas de manager/operator/account.
   * "content": descrição em 16px body, o lead das páginas de conteúdo do consumer.
   */
  variant?: "admin" | "content";
  /** Bloco extra abaixo do lead, ainda dentro do header (ex: a busca da FAQ). */
  children?: React.ReactNode;
  className?: string;
};

export function PageHeader({
  title,
  eyebrow,
  description,
  actions,
  variant = "admin",
  children,
  className,
}: Props) {
  const isContent = variant === "content";

  return (
    <header
      className={cn(
        "flex flex-col gap-3 tablet:flex-row tablet:items-end tablet:justify-between",
        // O cabeçalho é uma zona, não mais um bloco na fila. As páginas do painel
        // empilham tudo com `gap-6` (24px), então o header ficava a 24px do corpo,
        // exatamente a mesma distância que os blocos do corpo guardam entre si:
        // nada separava nada. Este respiro extra faz 24 + 16 = 40px depois do
        // header contra 24px entre blocos, e é o que cria o agrupamento.
        !isContent && "pb-4",
        className,
      )}
    >
      <div className="flex flex-col gap-2">
        {eyebrow && (
          <span className="text-[11px] font-bold uppercase tracking-[0.4px] text-mp-indigo">
            {eyebrow}
          </span>
        )}
        <h1 className="text-display-xl text-ink">{title}</h1>
        {description && (
          <p className={isContent ? "text-body-md text-body" : "text-body-sm text-muted"}>
            {description}
          </p>
        )}
        {children}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </header>
  );
}
