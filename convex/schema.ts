import { authTables } from "@convex-dev/auth/server"
import { defineSchema, defineTable } from "convex/server"
import { v } from "convex/values"

export default defineSchema({
  ...authTables,
  users: defineTable({
    name: v.optional(v.string()),
    image: v.optional(v.string()),
    email: v.optional(v.string()),
    emailVerificationTime: v.optional(v.number()),
    phone: v.optional(v.string()),
    phoneVerificationTime: v.optional(v.number()),
    isAnonymous: v.optional(v.boolean()),
    linkColor: v.optional(v.string()),
  })
    .index("email", ["email"])
    .index("phone", ["phone"]),
  notes: defineTable({
    owner: v.id("users"),
    title: v.string(),
    content: v.string(),
    titleLower: v.string(),
    parentId: v.optional(v.id("notes")),
  })
    .index("by_owner", ["owner"])
    .index("by_owner_title", ["owner", "titleLower"])
    .index("by_owner_parent", ["owner", "parentId"]),
})
