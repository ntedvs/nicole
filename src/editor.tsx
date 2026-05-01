"use client"

import { useEditor, EditorContent, type Editor as TiptapEditor } from "@tiptap/react"
import { InputRule } from "@tiptap/core"
import StarterKit from "@tiptap/starter-kit"
import Image from "@tiptap/extension-image"
import Link from "@tiptap/extension-link"
import Placeholder from "@tiptap/extension-placeholder"
import { Markdown } from "tiptap-markdown"
import { useEffect, useMemo, useRef, useState } from "react"

const WIKI_PREFIX = "#wiki/"

const wikiHref = (title: string) => `${WIKI_PREFIX}${encodeURIComponent(title.trim())}`
const isWikiHref = (href: string) => href.startsWith(WIKI_PREFIX)
const wikiTitle = (href: string) => decodeURIComponent(href.slice(WIKI_PREFIX.length))

function preprocessMarkdown(md: string): string {
  return md.replace(/\[\[([^[\]\n]+?)\]\]/g, (_m, title: string) => {
    const t = title.trim()
    return `[${t}](${wikiHref(t)})`
  })
}

function postprocessMarkdown(md: string): string {
  return md.replace(/\[([^\]]+)\]\((#wiki\/[^)]+)\)/g, (_m, _label: string, href: string) => {
    return `[[${wikiTitle(href)}]]`
  })
}

export type NoteOption = { id: string; title: string }

export function Editor({
  initialMarkdown,
  onChange,
  onOpenWikiLink,
  uploadImage,
  noteOptions,
  onCreateNote,
}: {
  initialMarkdown: string
  onChange: (markdown: string) => void
  onOpenWikiLink: (title: string) => void
  uploadImage: (file: File) => Promise<string>
  noteOptions: NoteOption[]
  onCreateNote: (title: string) => Promise<string>
}) {
  const onOpenRef = useRef(onOpenWikiLink)
  onOpenRef.current = onOpenWikiLink
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const uploadRef = useRef(uploadImage)
  uploadRef.current = uploadImage

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ link: false }),
      Image.configure({ inline: false, allowBase64: false }),
      Link.extend({
        addInputRules() {
          return [
            new InputRule({
              find: /\[\[([^[\]\n]+)\]\]$/,
              handler: ({ state, range, match }) => {
                const title = match[1].trim()
                if (!title) return null
                const { tr, schema } = state
                const mark = schema.marks.link.create({ href: wikiHref(title) })
                tr.replaceWith(range.from, range.to, schema.text(title, [mark]))
                tr.removeStoredMark(schema.marks.link)
              },
            }),
          ]
        },
      }).configure({
        openOnClick: false,
        autolink: true,
        HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" },
      }),
      Placeholder.configure({ placeholder: "Start writing…" }),
      Markdown.configure({
        html: false,
        linkify: true,
        breaks: true,
        transformPastedText: true,
      }),
    ],
    content: "",
    editorProps: {
      attributes: {
        class:
          "prose prose-stone max-w-none focus:outline-none min-h-[60vh] prose-img:rounded-lg prose-headings:font-serif",
      },
      handleClickOn: (_view, _pos, _node, _nodePos, event) => {
        const target = event.target as HTMLElement
        const a = target.closest("a") as HTMLAnchorElement | null
        if (!a) return false
        const href = a.getAttribute("href") ?? ""
        if (isWikiHref(href)) {
          event.preventDefault()
          onOpenRef.current(wikiTitle(href))
          return true
        }
        if (event.metaKey || event.ctrlKey) {
          window.open(href, "_blank", "noopener,noreferrer")
          return true
        }
        return false
      },
      handlePaste: (view, event) => {
        const files = Array.from(event.clipboardData?.files ?? []).filter((f) =>
          f.type.startsWith("image/"),
        )
        if (files.length === 0) return false
        event.preventDefault()
        void insertImages(view, files, uploadRef.current)
        return true
      },
      handleDrop: (view, event) => {
        const files = Array.from(event.dataTransfer?.files ?? []).filter((f) =>
          f.type.startsWith("image/"),
        )
        if (files.length === 0) return false
        event.preventDefault()
        void insertImages(view, files, uploadRef.current, event)
        return true
      },
    },
    onUpdate: ({ editor: ed }) => {
      const md = (
        ed.storage as unknown as { markdown: { getMarkdown: () => string } }
      ).markdown.getMarkdown()
      onChangeRef.current(postprocessMarkdown(md))
    },
  })

  // Load content once when the editor mounts. The parent remounts this
  // component (via key={noteId}) when switching notes, so we don't need to
  // react to initialMarkdown changes — and reacting would clobber in-flight
  // edits whenever the autosave round-trips.
  const loadedRef = useRef(false)
  useEffect(() => {
    if (!editor || loadedRef.current) return
    loadedRef.current = true
    editor.commands.setContent(preprocessMarkdown(initialMarkdown), { emitUpdate: false })
  }, [editor, initialMarkdown])

  return (
    <div className="wiki-editor">
      <style>{`
        .wiki-editor a[href^="${WIKI_PREFIX}"] {
          color: rgb(120 53 15);
          background: rgb(254 243 199 / 0.5);
          padding: 0 2px;
          border-radius: 3px;
          text-decoration: none;
          border-bottom: 1px solid rgb(217 119 6 / 0.4);
          cursor: pointer;
        }
        .wiki-editor a[href^="${WIKI_PREFIX}"]:hover {
          background: rgb(254 243 199);
        }
        .wiki-editor .ProseMirror p.is-editor-empty:first-child::before {
          content: attr(data-placeholder);
          float: left;
          color: rgb(168 162 158);
          pointer-events: none;
          height: 0;
        }
      `}</style>
      {editor && (
        <Toolbar
          editor={editor}
          uploadImage={uploadImage}
          noteOptions={noteOptions}
          onCreateNote={onCreateNote}
        />
      )}
      <EditorContent editor={editor} />
    </div>
  )
}

function Toolbar({
  editor,
  uploadImage,
  noteOptions,
  onCreateNote,
}: {
  editor: TiptapEditor
  uploadImage: (file: File) => Promise<string>
  noteOptions: NoteOption[]
  onCreateNote: (title: string) => Promise<string>
}) {
  // Re-render when selection or doc changes so active states update.
  const [, setTick] = useState(0)
  useEffect(() => {
    const update = () => setTick((t) => t + 1)
    editor.on("selectionUpdate", update)
    editor.on("transaction", update)
    return () => {
      editor.off("selectionUpdate", update)
      editor.off("transaction", update)
    }
  }, [editor])

  const fileRef = useRef<HTMLInputElement | null>(null)
  const [linkOpen, setLinkOpen] = useState(false)

  const insertWikiLink = (title: string) => {
    const t = title.trim()
    if (!t) return
    const { from, to } = editor.state.selection
    const text = from === to ? t : editor.state.doc.textBetween(from, to)
    editor
      .chain()
      .focus()
      .insertContentAt({ from, to }, [
        { type: "text", text, marks: [{ type: "link", attrs: { href: wikiHref(t) } }] },
      ])
      .run()
    setLinkOpen(false)
  }

  return (
    <div className="sticky top-0 z-10 -mx-1 mb-4 flex flex-wrap items-center gap-1 border-b border-stone-200 bg-stone-50/90 px-1 py-2 backdrop-blur">
      <Group>
        <TBtn
          label="Heading 1"
          active={editor.isActive("heading", { level: 1 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        >
          <span className="font-serif text-base font-semibold">H1</span>
        </TBtn>
        <TBtn
          label="Heading 2"
          active={editor.isActive("heading", { level: 2 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        >
          <span className="font-serif text-base font-semibold">H2</span>
        </TBtn>
        <TBtn
          label="Heading 3"
          active={editor.isActive("heading", { level: 3 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        >
          <span className="font-serif text-base font-semibold">H3</span>
        </TBtn>
      </Group>
      <Divider />
      <Group>
        <TBtn
          label="Bold"
          active={editor.isActive("bold")}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <b>B</b>
        </TBtn>
        <TBtn
          label="Italic"
          active={editor.isActive("italic")}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <i>I</i>
        </TBtn>
        <TBtn
          label="Underline"
          active={editor.isActive("underline")}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
        >
          <u>U</u>
        </TBtn>
        <TBtn
          label="Strikethrough"
          active={editor.isActive("strike")}
          onClick={() => editor.chain().focus().toggleStrike().run()}
        >
          <s>S</s>
        </TBtn>
      </Group>
      <Divider />
      <Group>
        <TBtn
          label="Bulleted list"
          active={editor.isActive("bulletList")}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          •
        </TBtn>
        <TBtn
          label="Numbered list"
          active={editor.isActive("orderedList")}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          1.
        </TBtn>
        <TBtn
          label="Quote"
          active={editor.isActive("blockquote")}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
        >
          ❝
        </TBtn>
      </Group>
      <Divider />
      <Group>
        <TBtn label="Insert image" onClick={() => fileRef.current?.click()}>
          🖼
        </TBtn>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={async (e) => {
            const file = e.target.files?.[0]
            e.target.value = ""
            if (!file) return
            try {
              const url = await uploadImage(file)
              editor.chain().focus().setImage({ src: url, alt: file.name }).run()
            } catch (err) {
              console.error(err)
            }
          }}
        />
        <div className="relative">
          <TBtn label="Link to note" active={linkOpen} onClick={() => setLinkOpen((v) => !v)}>
            🔗
          </TBtn>
          {linkOpen && (
            <NotePicker
              options={noteOptions}
              onClose={() => setLinkOpen(false)}
              onPick={insertWikiLink}
              onCreate={async (title) => {
                await onCreateNote(title)
                insertWikiLink(title)
              }}
            />
          )}
        </div>
      </Group>
    </div>
  )
}

function Group({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center gap-0.5">{children}</div>
}

function Divider() {
  return <div className="mx-1 h-5 w-px bg-stone-300" />
}

function TBtn({
  children,
  label,
  active,
  onClick,
}: {
  children: React.ReactNode
  label: string
  active?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`min-w-8 h-8 px-2 rounded-md text-sm flex items-center justify-center transition ${
        active ? "bg-stone-900 text-white" : "text-stone-700 hover:bg-stone-200"
      }`}
    >
      {children}
    </button>
  )
}

function NotePicker({
  options,
  onPick,
  onCreate,
  onClose,
}: {
  options: NoteOption[]
  onPick: (title: string) => void
  onCreate: (title: string) => void | Promise<void>
  onClose: () => void
}) {
  const [query, setQuery] = useState("")
  const ref = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener("mousedown", onDoc)
    return () => document.removeEventListener("mousedown", onDoc)
  }, [onClose])

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options.slice(0, 8)
    return options.filter((o) => o.title.toLowerCase().includes(q)).slice(0, 8)
  }, [options, query])
  const exact = options.some((o) => o.title.toLowerCase() === query.trim().toLowerCase())
  const canCreate = query.trim().length > 0 && !exact

  return (
    <div
      ref={ref}
      className="absolute top-full left-0 z-20 mt-1 w-64 rounded-lg border border-stone-200 bg-white shadow-lg"
    >
      <input
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose()
          if (e.key === "Enter") {
            e.preventDefault()
            if (matches[0]) onPick(matches[0].title)
            else if (canCreate) void onCreate(query.trim())
          }
        }}
        placeholder="Search or create note…"
        className="w-full rounded-t-lg border-b border-stone-200 px-3 py-2 text-sm focus:outline-none"
      />
      <ul className="max-h-64 overflow-y-auto py-1">
        {matches.map((o) => (
          <li key={o.id}>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onPick(o.title)}
              className="w-full truncate px-3 py-1.5 text-left text-sm hover:bg-stone-100"
            >
              {o.title}
            </button>
          </li>
        ))}
        {matches.length === 0 && !canCreate && (
          <li className="px-3 py-2 text-sm text-stone-400">No notes</li>
        )}
        {canCreate && (
          <li className="border-t border-stone-100">
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => void onCreate(query.trim())}
              className="w-full truncate px-3 py-1.5 text-left text-sm text-amber-800 hover:bg-amber-50"
            >
              + Create &ldquo;{query.trim()}&rdquo;
            </button>
          </li>
        )}
      </ul>
    </div>
  )
}

async function insertImages(
  view: import("@tiptap/pm/view").EditorView,
  files: File[],
  upload: (f: File) => Promise<string>,
  dropEvent?: DragEvent,
) {
  for (const file of files) {
    try {
      const url = await upload(file)
      const node = view.state.schema.nodes.image.create({ src: url, alt: file.name })
      const pos = dropEvent
        ? (view.posAtCoords({ left: dropEvent.clientX, top: dropEvent.clientY })?.pos ??
          view.state.selection.from)
        : view.state.selection.from
      const tr = view.state.tr.insert(pos, node)
      view.dispatch(tr)
    } catch (e) {
      console.error("Image upload failed", e)
    }
  }
}
