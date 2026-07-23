import { cn } from "@/lib/utils";
import { BackLink } from "./BackLink";

type Props = {
  title: string;
  eyebrow?: string;
  description?: string;
  /** Voltar padrão acima do título (link, não botão). Nomeie o destino. */
  back?: { to: string; label: string };
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
  back,
  actions,
  variant = "admin",
  children,
  className,
}: Props) {
  const isContent = variant === "content";

  return (
    <div
      className={cn(
        // O cabeçalho é uma zona, não mais um bloco na fila. As páginas do painel
        // empilham tudo com `gap-6` (24px), então o header ficava a 24px do corpo,
        // exatamente a mesma distância que os blocos do corpo guardam entre si:
        // nada separava nada. Este respiro extra faz 24 + 16 = 40px depois do
        // header contra 24px entre blocos, e é o que cria o agrupamento.
        !isContent && "pb-4",
        className,
      )}
    >
      {/* Voltar padrão, acima do título, quando a página é filha de outra. */}
      {back && <BackLink to={back.to} label={back.label} className="mb-2" />}
      <header className="flex flex-col gap-3 tablet:flex-row tablet:items-end tablet:justify-between">
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
    </div>
  );
}
