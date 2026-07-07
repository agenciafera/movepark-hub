import * as React from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import { Bold, Italic, Heading2, Heading3, List, ListOrdered, Link2, Unlink } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  /** HTML inicial (não é controlado após montar — remonte via `key` no pai para trocar de documento). */
  initialContent: string;
  onChange: (html: string) => void;
};

function ToolbarButton({
  active,
  onClick,
  title,
  children,
}: {
  active?: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={cn(
        "flex h-8 w-8 items-center justify-center rounded-md border border-hairline text-ink transition-colors hover:bg-surface-hover",
        active && "bg-mp-indigo/10 border-mp-indigo text-mp-indigo",
      )}
    >
      {children}
    </button>
  );
}

/**
 * Editor rich text para documentos legais. Schema RESTRITO (só headings h2/h3, negrito, itálico,
 * listas, links) — não aceita HTML cru/script. Links limitados a http/https/mailto. Client-only
 * (immediatelyRender:false para não quebrar no build SSG).
 */
export function RichTextEditor({ initialContent, onChange }: Props) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        codeBlock: false,
        code: false,
        blockquote: false,
        horizontalRule: false,
      }),
      Link.configure({
        openOnClick: false,
        autolink: true,
        protocols: ["http", "https", "mailto"],
        HTMLAttributes: { rel: "noopener noreferrer" },
      }),
    ],
    content: initialContent,
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
  });

  if (!editor) return null;

  function setLink() {
    const prev = editor!.getAttributes("link").href as string | undefined;
    const url = window.prompt("URL do link (http/https/mailto):", prev ?? "https://");
    if (url === null) return;
    if (url === "") {
      editor!.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor!.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  }

  return (
    <div className="rounded-lg border border-hairline">
      <div className="flex flex-wrap gap-1 border-b border-hairline bg-surface p-2">
        <ToolbarButton title="Negrito" active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}>
          <Bold className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton title="Itálico" active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}>
          <Italic className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton title="Título (H2)" active={editor.isActive("heading", { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
          <Heading2 className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton title="Subtítulo (H3)" active={editor.isActive("heading", { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>
          <Heading3 className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton title="Lista" active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()}>
          <List className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton title="Lista numerada" active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
          <ListOrdered className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton title="Link" active={editor.isActive("link")} onClick={setLink}>
          <Link2 className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton title="Remover link" onClick={() => editor.chain().focus().unsetLink().run()}>
          <Unlink className="h-4 w-4" />
        </ToolbarButton>
      </div>
      <EditorContent
        editor={editor}
        className="max-h-[60vh] overflow-y-auto px-4 py-3 text-body-sm text-ink [&_a]:text-mp-indigo [&_a]:underline [&_h2]:mt-6 [&_h2]:text-title-sm [&_h2]:font-semibold [&_h3]:mt-4 [&_h3]:font-semibold [&_li]:mt-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:mt-2 [&_ul]:list-disc [&_ul]:pl-5 [&_.ProseMirror]:min-h-[300px] [&_.ProseMirror]:outline-none"
      />
    </div>
  );
}
