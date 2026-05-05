import { getAuthUserId } from "@convex-dev/auth/server"
import { v } from "convex/values"
import { mutation, query } from "./_generated/server"

const HEX = /^[0-9a-fA-F]{6}$/

export const get = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx)
    if (!userId) return null
    const user = await ctx.db.get(userId)
    return { linkColor: user?.linkColor ?? null }
  },
})

export const setLinkColor = mutation({
  args: { color: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx)
    if (!userId) throw new Error("Not authenticated")
    const normalized = args.color.replace(/^#/, "").toLowerCase()
    if (!HEX.test(normalized)) throw new Error("Invalid hex color")
    await ctx.db.patch(userId, { linkColor: normalized })
  },
})
