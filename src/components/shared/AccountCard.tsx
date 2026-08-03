import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Gramática visual da área da conta (handoff "Minha Conta Cliente"). As telas repetem
 * a mesma casca: card branco de raio 20, título 16/600, subtítulo de apoio e uma ação
 * no canto. Antes cada página remontava a sua com `PageHeader` mais um `div` solto, e
 * elas foram divergindo.
 */
export function AccountCard({
  title,
  subtitle,
  action,
  className,
  bodyClassName,
  children,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={cn("rounded-lg border border-hairline bg-canvas p-5 desktop:p-7", className)}>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-title-md text-ink">{title}</h2>
          {subtitle && <p className="mt-1 text-body-sm text-muted">{subtitle}</p>}
        </div>
        {action}
      </div>
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

/** O selo de item padrão (veículo, endereço, cartão). Pílula violeta, 11/700. */
export function DefaultPill({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full bg-mp-primary px-2.5 py-1 text-badge text-white",
        className,
      )}
    >
      padrão
    </span>
  );
}

/**
 * Linha de item cadastrado: ícone à esquerda, identificador em destaque com o selo de
 * padrão ao lado, detalhe embaixo e as ações à direita.
 */
export function AccountRow({
  icon,
  title,
  isDefault,
  detail,
  actions,
}: {
  icon: React.ReactNode;
  title: string;
  isDefault?: boolean;
  /** Aceita nó porque endereço mostra duas linhas com tintas diferentes. */
  detail?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <li
      className={cn(
        "flex flex-wrap items-center gap-4 rounded-md border p-4",
        // O item padrão é o que vai ser usado sem ninguém escolher, então ele se
        // separa da lista em vez de depender só da pílula lá no meio do texto.
        isDefault
          ? "border-mp-primary/40 bg-surface-pale"
          : "border-hairline bg-canvas",
      )}
    >
      <span
        className={cn(
          "flex h-12 w-12 shrink-0 items-center justify-center rounded-md",
          isDefault ? "bg-mp-primary text-white" : "bg-mp-pale text-mp-indigo",
        )}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2.5">
          <span className="text-title-md tracking-[0.02em] text-ink">{title}</span>
          {isDefault && <DefaultPill />}
        </span>
        {detail && <span className="mt-1 block text-caption-sm text-muted">{detail}</span>}
      </span>
      {actions && <span className="flex shrink-0 flex-wrap gap-2">{actions}</span>}
    </li>
  );
}

/**
 * Ação de linha: pílula de 38px sobre superfície suave. O design deixa as ações à
 * mostra em vez de escondê-las num menu kebab, que era o que a conta fazia.
 */
export function RowAction({
  tone = "neutral",
  onClick,
  children,
}: {
  tone?: "neutral" | "primary" | "danger";
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "h-[38px] rounded-full bg-surface-soft px-4 text-caption-sm font-semibold transition-colors hover:bg-surface-strong",
        tone === "primary" && "text-mp-primary",
        tone === "neutral" && "text-muted",
        tone === "danger" && "text-error",
      )}
    >
      {children}
    </button>
  );
}
