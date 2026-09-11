"use client";

import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  Bold,
  Code,
  Heading2,
  Heading3,
  Italic,
  List,
  ListOrdered,
  Quote,
  Redo2,
  Undo2,
} from "lucide-react";
import { cn } from "@/lib/utils";

const TOOLS = [
  { icon: Bold, action: "toggleBold", name: "bold" },
  { icon: Italic, action: "toggleItalic", name: "italic" },
  { icon: Heading2, action: "toggleHeading2", name: "heading2" },
  { icon: Heading3, action: "toggleHeading3", name: "heading3" },
  { icon: List, action: "toggleBulletList", name: "bulletList" },
  { icon: ListOrdered, action: "toggleOrderedList", name: "orderedList" },
  { icon: Quote, action: "toggleBlockquote", name: "blockquote" },
  { icon: Code, action: "toggleCode", name: "code" },
] as const;

export function RichEditor({
  content,
  onChange,
  placeholder,
  className,
  minHeight = "220px",
  editable = true,
}: {
  content: string;
  onChange?: (html: string) => void;
  placeholder?: string;
  className?: string;
  minHeight?: string;
  editable?: boolean;
}) {
  const editor = useEditor({
    extensions: [StarterKit],
    content: content || "",
    editable,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: "tiptap prose-orbit focus:outline-none",
        style: `min-height:${minHeight}`,
      },
    },
    onUpdate: ({ editor: instance }) => onChange?.(instance.getHTML()),
  });

  if (!editor) {
    return <div className="rounded-md border border-border bg-surface-2" style={{ minHeight }} />;
  }

  const run = (action: string) => {
    const chain = editor.chain().focus();
    switch (action) {
      case "toggleBold":
        return chain.toggleBold().run();
      case "toggleItalic":
        return chain.toggleItalic().run();
      case "toggleHeading2":
        return chain.toggleHeading({ level: 2 }).run();
      case "toggleHeading3":
        return chain.toggleHeading({ level: 3 }).run();
      case "toggleBulletList":
        return chain.toggleBulletList().run();
      case "toggleOrderedList":
        return chain.toggleOrderedList().run();
      case "toggleBlockquote":
        return chain.toggleBlockquote().run();
      case "toggleCode":
        return chain.toggleCode().run();
      default:
        return undefined;
    }
  };

  const isActive = (name: string) => {
    if (name === "heading2") return editor.isActive("heading", { level: 2 });
    if (name === "heading3") return editor.isActive("heading", { level: 3 });
    return editor.isActive(name);
  };

  return (
    <div className={cn("overflow-hidden rounded-md border border-border bg-surface-2", className)}>
      {editable ? (
        <div className="flex flex-wrap items-center gap-0.5 border-b border-border bg-surface px-1.5 py-1">
          {TOOLS.map((tool) => (
            <button
              key={tool.name}
              type="button"
              onClick={() => run(tool.action)}
              className={cn(
                "rounded p-1.5 text-muted transition-colors hover:bg-surface-2 hover:text-text",
                isActive(tool.name) && "bg-accent-soft text-accent",
              )}
            >
              <tool.icon className="h-3.5 w-3.5" />
            </button>
          ))}
          <div className="mx-1 h-4 w-px bg-border" />
          <button
            type="button"
            onClick={() => editor.chain().focus().undo().run()}
            className="rounded p-1.5 text-muted transition-colors hover:bg-surface-2 hover:text-text"
          >
            <Undo2 className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().redo().run()}
            className="rounded p-1.5 text-muted transition-colors hover:bg-surface-2 hover:text-text"
          >
            <Redo2 className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : null}
      <div className="px-3 py-2 text-[13px]">
        {!content && placeholder && editor.isEmpty ? (
          <p className="pointer-events-none absolute text-faint">{placeholder}</p>
        ) : null}
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}

export function ReadOnlyHtml({ html, className }: { html?: string | null; className?: string }) {
  if (!html) return null;
  return (
    <div
      className={cn("prose-orbit text-[13px] leading-relaxed text-text", className)}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
