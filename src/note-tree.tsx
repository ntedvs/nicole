"use client"

import { CaretDown, CaretRight, Plus } from "@phosphor-icons/react"
import { NavLink } from "react-router"
import { Id } from "../convex/_generated/dataModel"

export type NoteRow = {
  _id: Id<"notes">
  title: string
  parentId: Id<"notes"> | string | null
}

export function NoteTree({
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
                className={`flex w-5 shrink-0 justify-center text-stone-400 ${hasKids ? "" : "invisible"}`}
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
                  `min-w-0 flex-1 truncate py-2 pr-1 text-sm ${isActive ? "font-medium" : ""}`
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
