"use client"

import { useConvex, useMutation, useQuery } from "convex/react"
import { useEffect, useRef, useState } from "react"
import { useParams } from "react-router"
import { api } from "../convex/_generated/api"
import { Id } from "../convex/_generated/dataModel"
import { Editor } from "./editor"

export function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full items-center justify-center text-stone-400">
      {children}
    </div>
  )
}

export function NoteRoute({
  onOpenTitle,
  onDelete,
  noteOptions,
  onCreateNote,
  linkColor,
}: {
  onOpenTitle: (title: string) => void
  onDelete: (id: Id<"notes">) => void | Promise<void>
  noteOptions: { id: string; title: string }[]
  onCreateNote: (title: string) => Promise<string>
  linkColor: string | null
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
      linkColor={linkColor}
    />
  )
}

function NoteView({
  id,
  onOpenTitle,
  onDelete,
  noteOptions,
  onCreateNote,
  linkColor,
}: {
  id: Id<"notes">
  onOpenTitle: (title: string) => void
  onDelete: () => void
  noteOptions: { id: string; title: string }[]
  onCreateNote: (title: string) => Promise<string>
  linkColor: string | null
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

  if (note === undefined)
    return <div className="p-8 text-stone-400">Loading…</div>
  if (note === null)
    return <div className="p-8 text-stone-400">Note not found</div>

  return (
    <article className="mx-auto max-w-3xl px-10 py-12">
      <div className="mb-6 flex items-start justify-between">
        <input
          className="flex-1 bg-transparent font-serif text-4xl placeholder-stone-300 focus:outline-none"
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
        linkColor={linkColor}
      />
    </article>
  )
}
