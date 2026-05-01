import { v } from "convex/values"
import { query, mutation, type QueryCtx, type MutationCtx } from "./_generated/server"
import { getAuthUserId } from "@convex-dev/auth/server"
import type { Id } from "./_generated/dataModel"

async function requireUser(ctx: QueryCtx | MutationCtx): Promise<Id<"users">> {
  const userId = await getAuthUserId(ctx)
  if (!userId) throw new Error("Not authenticated")
  return userId
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx)
    if (!userId) return []
    const notes = await ctx.db
      .query("notes")
      .withIndex("by_owner", (q) => q.eq("owner", userId))
      .order("desc")
      .take(500)
    return notes.map((n) => ({
      _id: n._id,
      title: n.title,
      _creationTime: n._creationTime,
      parentId: n.parentId ?? null,
    }))
  },
})

export const get = query({
  args: { id: v.id("notes") },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx)
    const note = await ctx.db.get(args.id)
    if (!note || note.owner !== userId) return null
    return note
  },
})

export const getByTitle = query({
  args: { title: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx)
    if (!userId) return null
    const note = await ctx.db
      .query("notes")
      .withIndex("by_owner_title", (q) =>
        q.eq("owner", userId).eq("titleLower", args.title.trim().toLowerCase()),
      )
      .unique()
    return note
  },
})

export const create = mutation({
  args: { title: v.string(), parentId: v.optional(v.id("notes")) },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx)
    const title = args.title.trim() || "Untitled"
    const titleLower = title.toLowerCase()
    if (args.parentId) {
      const parent = await ctx.db.get(args.parentId)
      if (!parent || parent.owner !== userId) throw new Error("Parent not found")
    }
    return await ctx.db.insert("notes", {
      owner: userId,
      title,
      titleLower,
      content: "",
      parentId: args.parentId,
    })
  },
})

export const setParent = mutation({
  args: { id: v.id("notes"), parentId: v.union(v.id("notes"), v.null()) },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx)
    const note = await ctx.db.get(args.id)
    if (!note || note.owner !== userId) throw new Error("Not found")
    if (args.parentId) {
      if (args.parentId === args.id) throw new Error("Cannot parent to self")
      const parent = await ctx.db.get(args.parentId)
      if (!parent || parent.owner !== userId) throw new Error("Parent not found")
      // Prevent cycles: walk up from parent.
      let cursor: Id<"notes"> | undefined = parent.parentId
      while (cursor) {
        if (cursor === args.id) throw new Error("Cycle")
        const next = await ctx.db.get(cursor)
        cursor = next?.parentId
      }
      await ctx.db.patch(args.id, { parentId: args.parentId })
    } else {
      await ctx.db.patch(args.id, { parentId: undefined })
    }
  },
})

export const update = mutation({
  args: {
    id: v.id("notes"),
    title: v.optional(v.string()),
    content: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx)
    const note = await ctx.db.get(args.id)
    if (!note || note.owner !== userId) throw new Error("Not found")
    const patch: { title?: string; titleLower?: string; content?: string } = {}
    let oldTitle: string | null = null
    let newTitle: string | null = null
    if (args.title !== undefined) {
      const title = args.title.trim() || "Untitled"
      if (title !== note.title) {
        oldTitle = note.title
        newTitle = title
        patch.title = title
        patch.titleLower = title.toLowerCase()
      }
    }
    if (args.content !== undefined) patch.content = args.content
    if (Object.keys(patch).length > 0) await ctx.db.patch(args.id, patch)

    // Rewrite [[OldTitle]] → [[NewTitle]] across this user's notes.
    if (oldTitle && newTitle) {
      const pattern = new RegExp(`\\[\\[\\s*${escapeRegex(oldTitle)}\\s*\\]\\]`, "gi")
      const all = await ctx.db
        .query("notes")
        .withIndex("by_owner", (q) => q.eq("owner", userId))
        .take(1000)
      for (const n of all) {
        if (!pattern.test(n.content)) {
          pattern.lastIndex = 0
          continue
        }
        pattern.lastIndex = 0
        const updated = n.content.replace(pattern, `[[${newTitle}]]`)
        if (updated !== n.content) await ctx.db.patch(n._id, { content: updated })
      }
    }
  },
})

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

export const remove = mutation({
  args: { id: v.id("notes") },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx)
    const note = await ctx.db.get(args.id)
    if (!note || note.owner !== userId) throw new Error("Not found")
    const queue: Id<"notes">[] = [args.id]
    while (queue.length > 0) {
      const current = queue.shift()!
      const children = await ctx.db
        .query("notes")
        .withIndex("by_owner_parent", (q) => q.eq("owner", userId).eq("parentId", current))
        .collect()
      for (const c of children) queue.push(c._id)
      await ctx.db.delete(current)
    }
  },
})

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx)
    return await ctx.storage.generateUploadUrl()
  },
})

export const getImageUrl = query({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    return await ctx.storage.getUrl(args.storageId)
  },
})
