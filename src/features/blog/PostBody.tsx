import * as React from "react";
import { Link } from "react-router-dom";
import type { MdBlock, MdInline } from "./markdown.logic";
import { parseMarkdown } from "./markdown.logic";

/** Link interno vira `<Link>` (não recarrega a página); externo abre em nova aba. */
function InlineLink({ href, label }: { href: string; label: string }) {
  if (href.startsWith("/")) {
    return (
      <Link to={href} className="text-mp-primary underline underline-offset-2">
        {label}
      </Link>
    );
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer nofollow"
      className="text-mp-primary underline underline-offset-2"
    >
      {label}
    </a>
  );
}

function Inline({ nodes }: { nodes: MdInline[] }) {
  return (
    <>
      {nodes.map((node, i) => {
        if (node.type === "bold") return <strong key={i}>{node.value}</strong>;
        if (node.type === "italic") return <em key={i}>{node.value}</em>;
        if (node.type === "link")
          return <InlineLink key={i} href={node.href} label={node.label} />;
        return <React.Fragment key={i}>{node.value}</React.Fragment>;
      })}
    </>
  );
}

function Block({ block }: { block: MdBlock }) {
  switch (block.type) {
    case "heading": {
      if (block.level === 2) {
        return (
          <h2 className="mt-10 text-display-sm text-ink">
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
          <Inline nodes={item} />
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
        <blockquote className="mt-6 border-l-2 border-hairline pl-4 text-body-md text-body italic">
          <Inline nodes={block.content} />
        </blockquote>
      );
    case "image":
      return (
        <img
          src={block.src}
          alt={block.alt}
          loading="lazy"
          decoding="async"
          className="mt-8 w-full rounded-2xl border border-hairline bg-canvas"
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
export function PostBody({ markdown }: { markdown: string }) {
  const blocks = React.useMemo(() => parseMarkdown(markdown), [markdown]);

  return (
    <div className="[&>*:first-child]:mt-0">
      {blocks.map((block, i) => (
        <Block key={i} block={block} />
      ))}
    </div>
  );
}
