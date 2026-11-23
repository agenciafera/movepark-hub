import * as React from "react";
import { cn } from "@/lib/utils";
import {
  parseMarkdownRestrito,
  type BlocoRestrito,
  type InlineRestrito,
} from "@/lib/markdownRestrito";

function Inline({ nodes }: { nodes: InlineRestrito[] }) {
  return (
    <>
      {nodes.map((node, i) => {
        if (node.type === "bold")
          return (
            <strong key={i} className="font-semibold text-ink">
              <Inline nodes={node.children} />
            </strong>
          );
        if (node.type === "italic")
          return (
            <em key={i}>
              <Inline nodes={node.children} />
            </em>
          );
        if (node.type === "link")
          return (
            <a
              key={i}
              href={node.href}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="text-mp-primary underline underline-offset-2"
            >
              <Inline nodes={node.children} />
            </a>
          );
        return <React.Fragment key={i}>{node.value}</React.Fragment>;
      })}
    </>
  );
}

function Bloco({ bloco }: { bloco: BlocoRestrito }) {
  if (bloco.type === "list") {
    const items = bloco.items.map((item, i) => (
      <li key={i}>
        <Inline nodes={item} />
      </li>
    ));
    return bloco.ordered ? (
      <ol className="list-decimal space-y-1 pl-5">{items}</ol>
    ) : (
      <ul className="list-disc space-y-1 pl-5">{items}</ul>
    );
  }
  return (
    <p className="text-pretty">
      <Inline nodes={bloco.content} />
    </p>
  );
}

type Props = {
  /** O aviso em Markdown restrito. Vazio não renderiza nada (nem o wrapper). */
  markdown: string | null | undefined;
  /** Classes do wrapper: tipografia e cor vêm de quem usa (ficha, checkout, voucher, preview). */
  className?: string;
  "data-testid"?: string;
};

/**
 * Renderiza o aviso do estacionamento (`location.partner_notice_md`) como elemento React, sem
 * `dangerouslySetInnerHTML`: não existe caminho para HTML cru chegar à tela. Ver
 * `@/lib/markdownRestrito` e docs/specs/aviso-do-estacionamento.md.
 */
export function MarkdownRestrito({ markdown, className, ...rest }: Props) {
  const blocos = React.useMemo(() => parseMarkdownRestrito(markdown), [markdown]);
  if (blocos.length === 0) return null;
  return (
    <div className={cn("space-y-2", className)} data-testid={rest["data-testid"]}>
      {blocos.map((b, i) => (
        <Bloco key={i} bloco={b} />
      ))}
    </div>
  );
}
