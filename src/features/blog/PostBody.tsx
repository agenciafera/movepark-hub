import * as React from "react";
import { Link } from "react-router-dom";
import type { MdBlock, MdInline, MdListItem } from "./markdown.logic";
import { headingId, parseMarkdown } from "./markdown.logic";

/** Link interno vira `<Link>` (não recarrega a página); externo abre em nova aba. */
function InlineLink({ href, nodes }: { href: string; nodes: MdInline[] }) {
  const classe = "text-mp-primary underline underline-offset-2";
  // O rótulo é markdown: `[**Nome**](url)` precisa sair com o negrito aplicado.
  const conteudo = <Inline nodes={nodes} />;

  if (href.startsWith("/")) {
    return (
      <Link to={href} className={classe}>
        {conteudo}
      </Link>
    );
  }
  return (
    <a href={href} target="_blank" rel="noopener noreferrer nofollow" className={classe}>
      {conteudo}
    </a>
  );
}

function Inline({ nodes }: { nodes: MdInline[] }) {
  return (
    <>
      {nodes.map((node, i) => {
        if (node.type === "bold")
          return (
            <strong key={i}>
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
          return <InlineLink key={i} href={node.href} nodes={node.children} />;
        return <React.Fragment key={i}>{node.value}</React.Fragment>;
      })}
    </>
  );
}

/** Um nível de aninhamento basta: é o que o acervo migrado usa. */
function SubList({ sub }: { sub: NonNullable<MdListItem["sub"]> }) {
  const items = sub.items.map((item, i) => (
    <li key={i} className="text-body-md text-body">
      <Inline nodes={item} />
    </li>
  ));
  return sub.ordered ? (
    <ol className="mt-2 list-decimal space-y-1 pl-5">{items}</ol>
  ) : (
    <ul className="mt-2 list-[circle] space-y-1 pl-5">{items}</ul>
  );
}

function Block({ block, id }: { block: MdBlock; id?: string }) {
  switch (block.type) {
    case "heading": {
      if (block.level === 2) {
        return (
          // `scroll-mt` porque a topbar é fixa: sem ele a âncora do resumo para
          // com o título escondido atrás dela.
          <h2 id={id} className="mt-10 scroll-mt-24 text-display-sm text-ink">
            <Inline nodes={block.content} />
          </h2>
        );
      }
      if (block.level === 3) {
        return (
          <h3 className="mt-8 text-title-md text-ink">
            <Inline nodes={block.content} />
          </h3>
        );
      }
      return (
        <h4 className="mt-6 text-title-sm text-ink">
          <Inline nodes={block.content} />
        </h4>
      );
    }
    case "paragraph":
      return (
        <p className="mt-4 text-body-md text-body">
          <Inline nodes={block.content} />
        </p>
      );
    case "list": {
      const items = block.items.map((item, i) => (
        <li key={i} className="text-body-md text-body">
          <Inline nodes={item.content} />
          {item.sub && <SubList sub={item.sub} />}
        </li>
      ));
      return block.ordered ? (
        <ol className="mt-4 list-decimal space-y-2 pl-5">{items}</ol>
      ) : (
        <ul className="mt-4 list-disc space-y-2 pl-5">{items}</ul>
      );
    }
    case "quote":
      return (
        <blockquote className="mt-6 border-l-2 border-hairline pl-4 text-body-md italic text-body">
          <Inline nodes={block.content} />
        </blockquote>
      );
    case "table":
      return (
        /*
          A rolagem fica no wrapper, não na página: comparativo de preço tem 4
          colunas e no celular a tabela é mais larga que a tela.
        */
        <div className="mt-8 overflow-x-auto rounded-md border border-hairline">
          <table className="w-full border-collapse text-body-sm">
            {block.head.length > 0 && (
              <thead>
                <tr className="border-b border-hairline bg-surface-soft">
                  {block.head.map((celula, i) => (
                    <th key={i} className="px-4 py-3 text-left text-title-sm text-ink">
                      <Inline nodes={celula} />
                    </th>
                  ))}
                </tr>
              </thead>
            )}
            <tbody>
              {block.rows.map((linha, i) => (
                <tr key={i} className="border-b border-hairline-soft last:border-0">
                  {linha.map((celula, j) => (
                    <td key={j} className="px-4 py-3 align-top text-body">
                      <Inline nodes={celula} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "rule":
      return <hr className="mt-8 border-hairline" />;
    case "image":
      return (
        <img
          src={block.src}
          alt={block.alt}
          loading="lazy"
          decoding="async"
          className="mt-8 w-full rounded-md border border-hairline bg-canvas"
        />
      );
  }
}

/**
 * Corpo do post.
 *
 * O markdown vira elemento React, sem `dangerouslySetInnerHTML`: não existe
 * caminho de XSS mesmo se um dia o corpo passar a ser editado por mais gente.
 */
export function PostBody({
  markdown,
  minHeadingLevel = 2,
}: {
  markdown: string;
  /**
   * Nível mais raso que os títulos do corpo podem ocupar.
   *
   * O default 2 vale para post e para página de pergunta, onde o corpo é o
   * conteúdo principal e vem logo depois do `<h1>`. Passe 3 quando o corpo entra
   * EMBAIXO de um `<h2>` que já o intitula, como na página de destino: lá a
   * pergunta é o `<h2>` da seção, e um subtítulo do corpo em `<h2>` viraria irmão
   * dela em vez de parte da resposta, achatando o outline justo na página que o
   * crawler lê para entender a hierarquia.
   *
   * `normalizaTitulos` (em markdown.logic) já sobe a hierarquia quando o corpo não
   * tem `h2` nenhum, então rebaixar no Markdown de entrada não resolve: ele desfaz.
   * O ajuste tem que acontecer depois do parse, que é aqui.
   */
  minHeadingLevel?: 2 | 3;
}) {
  const blocks = React.useMemo(() => {
    const parsed = parseMarkdown(markdown);
    if (minHeadingLevel === 2) return parsed;
    const niveis = parsed.filter((b) => b.type === "heading").map((b) => b.level);
    if (!niveis.length) return parsed;
    const desloca = minHeadingLevel - Math.min(...niveis);
    if (desloca <= 0) return parsed;
    return parsed.map((b) =>
      b.type === "heading"
        ? { ...b, level: Math.min(4, b.level + desloca) as 2 | 3 | 4 }
        : b,
    );
  }, [markdown, minHeadingLevel]);

  /*
    Os ids dos h2 saem daqui, contando a ordem dos h2 no corpo, exatamente como
    `sectionsFrom` faz. É a mesma contagem nos dois lados de propósito: se um
    deles mudar de critério, a âncora do resumo passa a apontar para o nada.
  */
  const ids = React.useMemo(() => {
    let ordem = -1;
    return blocks.map((b) => {
      if (b.type !== "heading" || b.level !== 2) return undefined;
      ordem += 1;
      return headingId(inlineText(b.content), ordem);
    });
  }, [blocks]);

  return (
    <div className="[&>*:first-child]:mt-0">
      {blocks.map((block, i) => (
        <Block key={i} block={block} id={ids[i]} />
      ))}
    </div>
  );
}

/** Texto puro de uma sequência inline, para montar o id do título. */
function inlineText(nodes: MdInline[]): string {
  return nodes.map((n) => (n.type === "text" ? n.value : inlineText(n.children))).join("");
}
