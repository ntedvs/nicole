"use client"

import { useAuthActions } from "@convex-dev/auth/react"
import {
  Authenticated,
  Unauthenticated,
  useConvex,
  useConvexAuth,
  useMutation,
  useQuery,
} from "convex/react"
import { useEffect, useMemo, useState } from "react"
import { NavLink, Route, Routes, useNavigate } from "react-router"
import { api } from "../convex/_generated/api"
import { Id } from "../convex/_generated/dataModel"
import { NoteTree, type NoteRow } from "./note-tree"
import { EmptyState, NoteRoute } from "./note-view"
import { SettingsPage } from "./settings"
import { SignInForm } from "./sign-in"

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

function Workspace() {
  const { isAuthenticated } = useConvexAuth()
  const { signOut } = useAuthActions()
  const notesQuery = useQuery(api.notes.list)
  const notes = useMemo(() => notesQuery ?? [], [notesQuery])
  const settings = useQuery(api.settings.get)
  const linkColor = settings?.linkColor ?? null
  const createNote = useMutation(api.notes.create)
  const removeNote = useMutation(api.notes.remove)
  const convex = useConvex()
  const navigate = useNavigate()
  const [search, setSearch] = useState("")

  const filtered = useMemo(
    () =>
      notes.filter((n) => n.title.toLowerCase().includes(search.toLowerCase())),
    [notes, search],
  )

  const childrenByParent = useMemo(() => {
    const map = new Map<string | null, NoteRow[]>()
    const ids = new Set(filtered.map((n) => n._id))
    for (const n of filtered) {
      // If parent is filtered out by search, hoist to root so result is visible.
      const key =
        n.parentId && ids.has(n.parentId as unknown as Id<"notes">)
          ? n.parentId
          : null
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
    const existing = await convex.query(api.notes.getByTitle, {
      title: trimmed,
    })
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
    <div className="flex h-screen bg-stone-50 text-stone-900">
      <aside className="flex w-64 flex-col border-r border-stone-200 bg-white">
        <div className="border-b border-stone-200 p-4">
          <h1 className="mb-3 font-serif text-xl">Notes</h1>
          <input
            className="w-full rounded-md border border-stone-200 px-3 py-1.5 text-sm focus:ring-2 focus:ring-stone-300 focus:outline-none"
            placeholder="Search…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button
            onClick={() => void newNote()}
            className="mt-2 w-full rounded-md bg-stone-900 py-1.5 text-sm text-white hover:bg-stone-800"
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
        <div className="flex items-center justify-between border-t border-stone-200 p-4 pt-3">
          <NavLink
            to="/settings"
            className={({ isActive }) =>
              `text-xs ${isActive ? "text-stone-900" : "text-stone-500 hover:text-stone-800"}`
            }
          >
            Settings
          </NavLink>
          <button
            onClick={() => void signOut()}
            className="text-xs text-stone-500 hover:text-stone-800"
          >
            Sign out
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto">
        <Routes>
          <Route
            index
            element={<HomeRedirect firstId={notes[0]?._id ?? null} />}
          />
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
                linkColor={linkColor}
              />
            }
          />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="*" element={<EmptyState>Not found</EmptyState>} />
        </Routes>
      </main>
    </div>
  )
}

function HomeRedirect({ firstId }: { firstId: Id<"notes"> | null }) {
  const navigate = useNavigate()
  useEffect(() => {
    if (firstId) navigate(`/notes/${firstId}`, { replace: true })
  }, [firstId, navigate])
  return <EmptyState>Select or create a note</EmptyState>
}
