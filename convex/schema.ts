import { defineSchema, defineTable } from "convex/server"
import { v } from "convex/values"
import { authTables } from "@convex-dev/auth/server"

export default defineSchema({
  ...authTables,
  notes: defineTable({
    owner: v.id("users"),
    title: v.string(),
    content: v.string(),
    titleLower: v.string(),
  })
    .index("by_owner", ["owner"])
    .index("by_owner_title", ["owner", "titleLower"]),
})
