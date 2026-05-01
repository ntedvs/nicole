"use client"

import {
  Authenticated,
  Unauthenticated,
  useConvexAuth,
  useMutation,
  useQuery,
  useConvex,
} from "convex/react"
import { api } from "../convex/_generated/api"
import { useAuthActions } from "@convex-dev/auth/react"
import { useEffect, useMemo, useRef, useState } from "react"
import { Routes, Route, useParams, useNavigate, NavLink } from "react-router"
import type { Id } from "../convex/_generated/dataModel"
import { Editor } from "./editor"
import { CaretDown, CaretRight, Plus } from "@phosphor-icons/react"

export default function App() {
  return (
    <>
      <Authenticated>
        <Workspace />
      </Authenticated>
      <Unauthenticated>
        <SignInForm />
      </Unauthenticated>
    </>
  )
}

function SignInForm() {
  const { signIn } = useAuthActions()
  const [flow, setFlow] = useState<"signIn" | "signUp">("signIn")
  const [error, setError] = useState<string | null>(null)
  return (
    <div className="min-h-screen flex items-center justify-center bg-stone-50">
      <form
        className="w-full max-w-sm bg-white p-8 rounded-2xl shadow-sm border border-stone-200 space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          const formData = new FormData(e.target as HTMLFormElement)
          formData.set("flow", flow)
          void signIn("password", formData).catch((err) => setError(err.message))
        }}
      >
        <h1 className="text-2xl font-serif">
          {flow === "signIn" ? "Welcome back" : "Create your notebook"}
        </h1>
        <input
          className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-stone-400"
          type="email"
          name="email"
          placeholder="Email"
          required
        />
        <input
          className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-stone-400"
          type="password"
          name="password"
          placeholder="Password"
          required
        />
        <button
          type="submit"
          className="w-full bg-stone-900 text-white py-2 rounded-lg hover:bg-stone-800 transition"
        >
          {flow === "signIn" ? "Sign in" : "Sign up"}
        </button>
        <button
          type="button"
          className="w-full text-sm text-stone-500 hover:text-stone-800"
          onClick={() => setFlow(flow === "signIn" ? "signUp" : "signIn")}
        >
          {flow === "signIn" ? "Need an account? Sign up" : "Have an account? Sign in"}
        </button>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </form>
    </div>
  )
}

function Workspace() {
  const { isAuthenticated } = useConvexAuth()
  const { signOut } = useAuthActions()
  const notes = useQuery(api.notes.list) ?? []
  const createNote = useMutation(api.notes.create)
  const removeNote = useMutation(api.notes.remove)
  const convex = useConvex()
  const navigate = useNavigate()
  const [search, setSearch] = useState("")

  const filtered = useMemo(
    () => notes.filter((n) => n.title.toLowerCase().includes(search.toLowerCase())),
    [notes, search],
  )

  const childrenByParent = useMemo(() => {
    const map = new Map<string | null, typeof filtered>()
    const ids = new Set(filtered.map((n) => n._id))
    for (const n of filtered) {
      // If parent is filtered out by search, hoist to root so result is visible.
      const key = n.parentId && ids.has(n.parentId as unknown as Id<"notes">) ? n.parentId : null
      const arr = map.get(key as string | null) ?? []
      arr.push(n)
      map.set(key as string | null, arr)
    }
    return map
  }, [filtered])

  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const toggleCollapsed = (id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const openByTitle = async (title: string) => {
    const trimmed = title.trim()
    if (!trimmed) return
    const existing = await convex.query(api.notes.getByTitle, { title: trimmed })
    if (existing) {
      navigate(`/notes/${existing._id}`)
    } else {
      const id = await createNote({ title: trimmed })
      navigate(`/notes/${id}`)
    }
  }

  const newNote = async (parentId?: Id<"notes">) => {
    const id = await createNote({ title: "Untitled", parentId })
    if (parentId) {
      setCollapsed((prev) => {
        const next = new Set(prev)
        next.delete(parentId as unknown as string)
        return next
      })
    }
    navigate(`/notes/${id}`)
  }

  if (!isAuthenticated) return null

  return (
    <div className="h-screen flex bg-stone-50 text-stone-900">
      <aside className="w-64 border-r border-stone-200 bg-white flex flex-col">
        <div className="p-4 border-b border-stone-200">
          <h1 className="font-serif text-xl mb-3">Notes</h1>
          <input
            className="w-full px-3 py-1.5 text-sm border border-stone-200 rounded-md focus:outline-none focus:ring-2 focus:ring-stone-300"
            placeholder="Search…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button
            onClick={() => void newNote()}
            className="mt-2 w-full text-sm bg-stone-900 text-white py-1.5 rounded-md hover:bg-stone-800"
          >
            + New note
          </button>
        </div>
        <ul className="flex-1 overflow-y-auto py-2">
          <NoteTree
            parentId={null}
            depth={0}
            childrenByParent={childrenByParent}
            collapsed={collapsed}
            onToggle={toggleCollapsed}
            onAddChild={(pid) => void newNote(pid)}
          />
          {filtered.length === 0 && (
            <li className="px-4 py-2 text-sm text-stone-400">No notes yet</li>
          )}
        </ul>
        <div className="border-t border-stone-200 p-4 flex">
          <button
            onClick={() => void signOut()}
            className="text-xs text-stone-500 hover:text-stone-800 mb-1"
          >
            Sign out
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto">
        <Routes>
          <Route index element={<HomeRedirect firstId={notes[0]?._id ?? null} />} />
          <Route
            path="notes/:id"
            element={
              <NoteRoute
                onOpenTitle={(t) => void openByTitle(t)}
                onDelete={async (id) => {
                  await removeNote({ id })
                  navigate("/")
                }}
                noteOptions={notes.map((n) => ({ id: n._id, title: n.title }))}
                onCreateNote={async (title) => {
                  const id = await createNote({ title })
                  return id as string
                }}
              />
            }
          />
          <Route path="*" element={<EmptyState>Not found</EmptyState>} />
        </Routes>
      </main>
    </div>
  )
}

type NoteRow = { _id: Id<"notes">; title: string; parentId: Id<"notes"> | string | null }

function NoteTree({
  parentId,
  depth,
  childrenByParent,
  collapsed,
  onToggle,
  onAddChild,
}: {
  parentId: string | null
  depth: number
  childrenByParent: Map<string | null, NoteRow[]>
  collapsed: Set<string>
  onToggle: (id: string) => void
  onAddChild: (parentId: Id<"notes">) => void
}) {
  const rows = childrenByParent.get(parentId) ?? []
  return (
    <>
      {rows.map((n) => {
        const idStr = n._id as unknown as string
        const kids = childrenByParent.get(idStr) ?? []
        const hasKids = kids.length > 0
        const isCollapsed = collapsed.has(idStr)
        return (
          <li key={idStr}>
            <div
              className="group flex items-center hover:bg-stone-100"
              style={{ paddingLeft: `${depth * 12}px` }}
            >
              <button
                onClick={() => onToggle(idStr)}
                className={`w-5 shrink-0 flex justify-center text-stone-400 ${hasKids ? "" : "invisible"}`}
                aria-label={isCollapsed ? "Expand" : "Collapse"}
              >
                {isCollapsed ? (
                  <CaretRight size={12} weight="bold" />
                ) : (
                  <CaretDown size={12} weight="bold" />
                )}
              </button>
              <NavLink
                to={`/notes/${n._id}`}
                className={({ isActive }) =>
                  `flex-1 min-w-0 truncate py-2 pr-1 text-sm ${isActive ? "font-medium" : ""}`
                }
              >
                {n.title || "Untitled"}
              </NavLink>
              <button
                onClick={() => onAddChild(n._id)}
                className="px-2 text-stone-400 opacity-0 group-hover:opacity-100 hover:text-stone-700"
                title="Add sub-note"
                aria-label="Add sub-note"
              >
                <Plus size={14} weight="bold" />
              </button>
            </div>
            {hasKids && !isCollapsed && (
              <NoteTree
                parentId={idStr}
                depth={depth + 1}
                childrenByParent={childrenByParent}
                collapsed={collapsed}
                onToggle={onToggle}
                onAddChild={onAddChild}
              />
            )}
          </li>
        )
      })}
    </>
  )
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return <div className="h-full flex items-center justify-center text-stone-400">{children}</div>
}

function HomeRedirect({ firstId }: { firstId: Id<"notes"> | null }) {
  const navigate = useNavigate()
  useEffect(() => {
    if (firstId) navigate(`/notes/${firstId}`, { replace: true })
  }, [firstId, navigate])
  return <EmptyState>Select or create a note</EmptyState>
}

function NoteRoute({
  onOpenTitle,
  onDelete,
  noteOptions,
  onCreateNote,
}: {
  onOpenTitle: (title: string) => void
  onDelete: (id: Id<"notes">) => void | Promise<void>
  noteOptions: { id: string; title: string }[]
  onCreateNote: (title: string) => Promise<string>
}) {
  const { id } = useParams<{ id: string }>()
  if (!id) return <EmptyState>Not found</EmptyState>
  const noteId = id as Id<"notes">
  return (
    <NoteView
      key={noteId}
      id={noteId}
      onOpenTitle={onOpenTitle}
      onDelete={() => void onDelete(noteId)}
      noteOptions={noteOptions}
      onCreateNote={onCreateNote}
    />
  )
}

function NoteView({
  id,
  onOpenTitle,
  onDelete,
  noteOptions,
  onCreateNote,
}: {
  id: Id<"notes">
  onOpenTitle: (title: string) => void
  onDelete: () => void
  noteOptions: { id: string; title: string }[]
  onCreateNote: (title: string) => Promise<string>
}) {
  const note = useQuery(api.notes.get, { id })
  const update = useMutation(api.notes.update)
  const generateUploadUrl = useMutation(api.notes.generateUploadUrl)
  const convex = useConvex()
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [titleDraft, setTitleDraft] = useState<string | null>(null)

  // Sync local draft when the server title changes and the user isn't typing.
  useEffect(() => {
    if (note && titleDraft === null) setTitleDraft(note.title)
  }, [note, titleDraft])

  const scheduleSave = (patch: { title?: string; content?: string }) => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      void update({ id, ...patch })
    }, 400)
  }

  const flushTitle = () => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    if (titleDraft !== null && note && titleDraft !== note.title) {
      void update({ id, title: titleDraft })
    }
  }

  const uploadImage = async (file: File): Promise<string> => {
    const url = await generateUploadUrl({})
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": file.type },
      body: file,
    })
    const { storageId } = (await res.json()) as { storageId: Id<"_storage"> }
    const publicUrl = await convex.query(api.notes.getImageUrl, { storageId })
    if (!publicUrl) throw new Error("Upload failed")
    return publicUrl
  }

  if (note === undefined) return <div className="p-8 text-stone-400">Loading…</div>
  if (note === null) return <div className="p-8 text-stone-400">Note not found</div>

  return (
    <article className="max-w-3xl mx-auto px-10 py-12">
      <div className="flex items-start justify-between mb-6">
        <input
          className="flex-1 text-4xl font-serif bg-transparent focus:outline-none placeholder-stone-300"
          value={titleDraft ?? note.title}
          placeholder="Untitled"
          onChange={(e) => {
            setTitleDraft(e.target.value)
            scheduleSave({ title: e.target.value })
          }}
          onBlur={flushTitle}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              ;(e.target as HTMLInputElement).blur()
            }
          }}
        />
        <button
          onClick={() => {
            if (confirm("Delete this note?")) onDelete()
          }}
          className="ml-4 text-sm text-stone-400 hover:text-red-600"
        >
          Delete
        </button>
      </div>
      <Editor
        initialMarkdown={note.content}
        onChange={(md) => scheduleSave({ content: md })}
        onOpenWikiLink={onOpenTitle}
        uploadImage={uploadImage}
        noteOptions={noteOptions}
        onCreateNote={onCreateNote}
      />
    </article>
  )
}
