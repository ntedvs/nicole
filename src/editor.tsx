"use client"

import Image from "@tiptap/extension-image"
import Link from "@tiptap/extension-link"
import Placeholder from "@tiptap/extension-placeholder"
import { NodeSelection } from "@tiptap/pm/state"
import { EditorView, NodeView } from "@tiptap/pm/view"
import { EditorContent, Editor as TiptapEditor, useEditor } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import { useEffect, useMemo, useRef, useState } from "react"
import { Markdown } from "tiptap-markdown"

const WIKI_PREFIX = "#wiki/"
const IMAGE_SIZE_TITLE = /^=(\d+)x(\d+)$/
const IMAGE_RESIZE_DIRECTIONS = [
  "top",
  "right",
  "bottom",
  "left",
  "top-right",
  "top-left",
  "bottom-right",
  "bottom-left",
] as const

const wikiHref = (title: string) =>
  `${WIKI_PREFIX}${encodeURIComponent(title.trim())}`
const isWikiHref = (href: string) => href.startsWith(WIKI_PREFIX)
const wikiTitle = (href: string) =>
  decodeURIComponent(href.slice(WIKI_PREFIX.length))

function preprocessMarkdown(md: string): string {
  return md.replace(/\[\[([^[\]\n]+?)\]\]/g, (_m, body: string) => {
    const pipe = body.indexOf("|")
    const title = (pipe === -1 ? body : body.slice(0, pipe)).trim()
    const label = (pipe === -1 ? body : body.slice(pipe + 1)).trim() || title
    return `[${label}](${wikiHref(title)})`
  })
}

function postprocessMarkdown(md: string): string {
  return md.replace(
    /\[([^\]]+)\]\((#wiki\/[^)]+)\)/g,
    (_m, label: string, href: string) => {
      const title = wikiTitle(href)
      return label === title ? `[[${title}]]` : `[[${title}|${label}]]`
    },
  )
}

export type NoteOption = { id: string; title: string }

const ResizableImage = Image.extend({
  addStorage() {
    return {
      markdown: {
        serialize: (
          state: {
            esc: (value: string) => string
            write: (value: string) => void
          },
          node: { attrs: Record<string, string | number | null> },
        ) => {
          const alt = String(node.attrs.alt || "")
          const src = String(node.attrs.src || "").replace(/[()]/g, "\\$&")
          const width = numericAttr(node.attrs.width)
          const height = numericAttr(node.attrs.height)
          const title =
            width && height
              ? `="${width}x${height}"`
              : node.attrs.title
                ? `"${String(node.attrs.title).replace(/"/g, '\\"')}"`
                : ""

          state.write(`![${state.esc(alt)}](${src}${title ? ` ${title}` : ""})`)
        },
        parse: {
          updateDOM: (element: HTMLElement) => {
            element.querySelectorAll("img[title]").forEach((img) => {
              const title = img.getAttribute("title") ?? ""
              const size = title.match(IMAGE_SIZE_TITLE)
              if (!size) return
              img.setAttribute("width", size[1])
              img.setAttribute("height", size[2])
              img.removeAttribute("title")
            })
          },
        },
      },
    }
  },
  addNodeView() {
    return ({ node, getPos, editor }) =>
      new ResizableImageView(node, getPos, editor.view)
  },
})

export function Editor({
  initialMarkdown,
  onChange,
  onOpenWikiLink,
  uploadImage,
  noteOptions,
  onCreateNote,
  linkColor,
}: {
  initialMarkdown: string
  onChange: (markdown: string) => void
  onOpenWikiLink: (title: string) => void
  uploadImage: (file: File) => Promise<string>
  noteOptions: NoteOption[]
  onCreateNote: (title: string) => Promise<string>
  linkColor?: string | null
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
      ResizableImage.configure({ inline: false, allowBase64: false }),
      Link.extend({ inclusive: false }).configure({
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
        const files = imageFilesFromClipboard(event.clipboardData)
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
    editor.commands.setContent(preprocessMarkdown(initialMarkdown), {
      emitUpdate: false,
    })
  }, [editor, initialMarkdown])

  const wikiColor = linkColor ? `#${linkColor}` : "rgb(120 53 15)"
  return (
    <div
      className="wiki-editor"
      style={{ ["--wiki-link-color" as string]: wikiColor }}
    >
      <style>{`
        .wiki-editor a[href^="${WIKI_PREFIX}"] {
          color: var(--wiki-link-color);
          padding: 0 2px;
          border-radius: 3px;
          text-decoration: none;
          border-bottom: 1px solid color-mix(in srgb, var(--wiki-link-color) 50%, transparent);
          cursor: pointer;
        }
        .wiki-editor a[href^="${WIKI_PREFIX}"]:hover {
          background: color-mix(in srgb, var(--wiki-link-color) 12%, transparent);
        }
        .wiki-editor .ProseMirror p.is-editor-empty:first-child::before {
          content: attr(data-placeholder);
          float: left;
          color: rgb(168 162 158);
          pointer-events: none;
          height: 0;
        }
        .wiki-editor .resizable-image {
          position: relative;
          display: inline-block;
          max-width: 100%;
          margin: 1.25em 0;
          line-height: 0;
        }
        .wiki-editor .resizable-image img {
          display: block;
          max-width: 100%;
          height: auto;
          margin: 0;
          border-radius: 0.5rem;
        }
        .wiki-editor .resizable-image.is-selected {
          outline: 2px solid rgb(41 37 36);
          outline-offset: 3px;
        }
        .wiki-editor .resizable-image__handle {
          position: absolute;
          z-index: 1;
          width: 10px;
          height: 10px;
          border: 2px solid white;
          border-radius: 999px;
          background: rgb(41 37 36);
          box-shadow: 0 1px 3px rgb(0 0 0 / 0.25);
          opacity: 0;
          pointer-events: none;
        }
        .wiki-editor .resizable-image.is-selected .resizable-image__handle {
          opacity: 1;
          pointer-events: auto;
        }
        .wiki-editor .resizable-image__handle[data-direction="top"] {
          top: -8px;
          left: 50%;
          transform: translateX(-50%);
          cursor: ns-resize;
        }
        .wiki-editor .resizable-image__handle[data-direction="right"] {
          top: 50%;
          right: -8px;
          transform: translateY(-50%);
          cursor: ew-resize;
        }
        .wiki-editor .resizable-image__handle[data-direction="bottom"] {
          bottom: -8px;
          left: 50%;
          transform: translateX(-50%);
          cursor: ns-resize;
        }
        .wiki-editor .resizable-image__handle[data-direction="left"] {
          top: 50%;
          left: -8px;
          transform: translateY(-50%);
          cursor: ew-resize;
        }
        .wiki-editor .resizable-image__handle[data-direction="top-right"] {
          top: -8px;
          right: -8px;
          cursor: nesw-resize;
        }
        .wiki-editor .resizable-image__handle[data-direction="top-left"] {
          top: -8px;
          left: -8px;
          cursor: nwse-resize;
        }
        .wiki-editor .resizable-image__handle[data-direction="bottom-right"] {
          right: -8px;
          bottom: -8px;
          cursor: nwse-resize;
        }
        .wiki-editor .resizable-image__handle[data-direction="bottom-left"] {
          bottom: -8px;
          left: -8px;
          cursor: nesw-resize;
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
        {
          type: "text",
          text,
          marks: [{ type: "link", attrs: { href: wikiHref(t) } }],
        },
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
          onClick={() =>
            editor.chain().focus().toggleHeading({ level: 1 }).run()
          }
        >
          <span className="font-serif text-base font-semibold">H1</span>
        </TBtn>
        <TBtn
          label="Heading 2"
          active={editor.isActive("heading", { level: 2 })}
          onClick={() =>
            editor.chain().focus().toggleHeading({ level: 2 }).run()
          }
        >
          <span className="font-serif text-base font-semibold">H2</span>
        </TBtn>
        <TBtn
          label="Heading 3"
          active={editor.isActive("heading", { level: 3 })}
          onClick={() =>
            editor.chain().focus().toggleHeading({ level: 3 }).run()
          }
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
              editor
                .chain()
                .focus()
                .setImage({ src: url, alt: file.name })
                .run()
            } catch (err) {
              console.error(err)
            }
          }}
        />
        <div className="relative">
          <TBtn
            label="Link to note"
            active={linkOpen}
            onClick={() => setLinkOpen((v) => !v)}
          >
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
      className={`flex h-8 min-w-8 items-center justify-center rounded-md px-2 text-sm transition ${
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
  const inputRef = useRef<HTMLInputElement | null>(null)
  useEffect(() => {
    inputRef.current?.focus()
  }, [])
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
  const exact = options.some(
    (o) => o.title.toLowerCase() === query.trim().toLowerCase(),
  )
  const canCreate = query.trim().length > 0 && !exact

  return (
    <div
      ref={ref}
      className="absolute top-full left-0 z-20 mt-1 w-64 rounded-lg border border-stone-200 bg-white shadow-lg"
    >
      <input
        ref={inputRef}
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

      const node = view.state.schema.nodes.image.create({
        src: url,
        alt: file.name,
      })

      const pos = dropEvent
        ? (view.posAtCoords({ left: dropEvent.clientX, top: dropEvent.clientY })
            ?.pos ?? view.state.selection.from)
        : view.state.selection.from

      const tr = view.state.tr.insert(pos, node)
      view.dispatch(tr)
    } catch (e) {
      console.error("Image upload failed", e)
    }
  }
}

function imageFilesFromClipboard(data: DataTransfer | null): File[] {
  if (!data) return []

  const files = Array.from(data.files).filter((file) =>
    file.type.startsWith("image/"),
  )
  if (files.length > 0) return files

  return Array.from(data.items)
    .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
    .map((item, index) => {
      const file = item.getAsFile()
      if (!file) return null
      if (file.name) return file

      const extension = file.type.split("/")[1]?.split(";")[0] || "png"
      return new File([file], `pasted-image-${index + 1}.${extension}`, {
        type: file.type,
        lastModified: file.lastModified,
      })
    })
    .filter((file): file is File => file !== null)
}

type ResizeDirection = (typeof IMAGE_RESIZE_DIRECTIONS)[number]

class ResizableImageView implements NodeView {
  dom: HTMLElement

  private img: HTMLImageElement

  constructor(
    private node: { attrs: Record<string, string | number | null> },
    private getPos: () => number | undefined,
    private view: EditorView,
  ) {
    this.dom = document.createElement("span")
    this.dom.className = "resizable-image"

    this.img = document.createElement("img")
    this.syncImage()
    this.dom.appendChild(this.img)

    for (const direction of IMAGE_RESIZE_DIRECTIONS) {
      const handle = document.createElement("span")
      handle.className = "resizable-image__handle"
      handle.dataset.direction = direction
      handle.addEventListener("mousedown", (event) =>
        this.startResize(event, direction),
      )
      this.dom.appendChild(handle)
    }

    this.dom.addEventListener("mousedown", () => this.select())
  }

  update(node: { attrs: Record<string, string | number | null> }) {
    this.node = node
    this.syncImage()
    return true
  }

  selectNode() {
    this.dom.classList.add("is-selected")
  }

  deselectNode() {
    this.dom.classList.remove("is-selected")
  }

  stopEvent(event: Event) {
    return event.target instanceof HTMLElement && event.target !== this.img
  }

  private syncImage() {
    const { src, alt, title, width, height } = this.node.attrs
    this.img.src = String(src || "")
    this.img.alt = String(alt || "")
    if (title) this.img.title = String(title)
    else this.img.removeAttribute("title")

    const w = numericAttr(width)
    const h = numericAttr(height)
    if (w) this.img.style.width = `${w}px`
    else this.img.style.removeProperty("width")
    if (h) this.img.style.height = `${h}px`
    else this.img.style.removeProperty("height")
  }

  private select() {
    const pos = this.getPos()
    if (pos === undefined) return
    const tr = this.view.state.tr.setSelection(
      NodeSelection.create(this.view.state.doc, pos),
    )
    this.view.dispatch(tr)
  }

  private startResize(event: MouseEvent, direction: ResizeDirection) {
    event.preventDefault()
    event.stopPropagation()
    this.select()

    const startX = event.clientX
    const startY = event.clientY
    const startWidth = this.img.offsetWidth
    const startHeight = this.img.offsetHeight
    const aspectRatio = startWidth / Math.max(startHeight, 1)
    const preserveAspectRatio = direction.includes("-")

    const onMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX
      const deltaY = moveEvent.clientY - startY
      const size = resizedImageSize({
        direction,
        deltaX,
        deltaY,
        startWidth,
        startHeight,
        aspectRatio,
        preserveAspectRatio,
      })

      this.img.style.width = `${size.width}px`
      this.img.style.height = `${size.height}px`
    }

    const onUp = () => {
      document.removeEventListener("mousemove", onMove)
      document.removeEventListener("mouseup", onUp)
      this.commitSize(this.img.offsetWidth, this.img.offsetHeight)
    }

    document.addEventListener("mousemove", onMove)
    document.addEventListener("mouseup", onUp)
  }

  private commitSize(width: number, height: number) {
    const pos = this.getPos()
    if (pos === undefined) return
    this.view.dispatch(
      this.view.state.tr
        .setNodeMarkup(pos, undefined, {
          ...this.node.attrs,
          width: Math.round(width),
          height: Math.round(height),
        })
        .setSelection(NodeSelection.create(this.view.state.doc, pos)),
    )
  }
}

function resizedImageSize({
  direction,
  deltaX,
  deltaY,
  startWidth,
  startHeight,
  aspectRatio,
  preserveAspectRatio,
}: {
  direction: ResizeDirection
  deltaX: number
  deltaY: number
  startWidth: number
  startHeight: number
  aspectRatio: number
  preserveAspectRatio: boolean
}) {
  const minSize = 40
  let width = startWidth
  let height = startHeight

  if (direction.includes("right")) width = startWidth + deltaX
  if (direction.includes("left")) width = startWidth - deltaX
  if (direction.includes("bottom")) height = startHeight + deltaY
  if (direction.includes("top")) height = startHeight - deltaY

  if (preserveAspectRatio) {
    if (Math.abs(width - startWidth) >= Math.abs(height - startHeight)) {
      width = Math.max(minSize, width)
      height = width / aspectRatio
    } else {
      height = Math.max(minSize, height)
      width = height * aspectRatio
    }
  }

  return {
    width: Math.max(minSize, Math.round(width)),
    height: Math.max(minSize, Math.round(height)),
  }
}

function numericAttr(value: string | number | null | undefined): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value !== "string") return null
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : null
}
