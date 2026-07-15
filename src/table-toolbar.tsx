"use client"

import { findTable } from "@tiptap/pm/tables"
import type { Editor } from "@tiptap/react"
import { useCallback } from "react"

export function InsertTableButton({ editor }: { editor: Editor }) {
  const inTable = editor.isActive("table")
  const insertTable = useCallback(() => {
    editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
  }, [editor])

  return (
    <TableButton label="Insert table" active={inTable} disabled={inTable} onClick={insertTable}>
      🧮
    </TableButton>
  )
}

export function TableControls({ editor }: { editor: Editor }) {
  const inTable = editor.isActive("table")
  const addRow = useCallback(() => {
    editor.chain().focus().addRowAfter().run()
  }, [editor])
  const deleteRow = useCallback(() => {
    if (!editor.can().deleteRow()) {
      editor.chain().focus().deleteTable().run()
      return
    }
    editor.chain().focus().deleteRow().run()
    ensureFirstRowIsMarkdownHeader(editor)
  }, [editor])
  const addColumn = useCallback(() => {
    editor.chain().focus().addColumnAfter().run()
  }, [editor])
  const deleteColumn = useCallback(() => {
    editor.chain().focus().deleteColumn().run()
  }, [editor])
  const deleteTable = useCallback(() => {
    editor.chain().focus().deleteTable().run()
  }, [editor])

  if (!inTable) return null

  return (
    <div className="mt-2 flex flex-wrap items-center gap-1 border-t border-stone-200 pt-2">
      <span className="px-1 text-xs font-medium text-stone-500">Table</span>
      <TableButton label="Add row after" disabled={!editor.can().addRowAfter()} onClick={addRow}>
        Row +
      </TableButton>
      <TableButton label="Delete row" onClick={deleteRow}>
        Row −
      </TableButton>
      <TableButton
        label="Add column after"
        disabled={!editor.can().addColumnAfter()}
        onClick={addColumn}
      >
        Column +
      </TableButton>
      <TableButton
        label="Delete column"
        disabled={!editor.can().deleteColumn()}
        onClick={deleteColumn}
      >
        Column −
      </TableButton>
      <TableButton label="Delete table" danger onClick={deleteTable}>
        Delete
      </TableButton>
    </div>
  )
}

function TableButton({
  children,
  label,
  active,
  danger = false,
  disabled = false,
  onClick,
}: {
  children: React.ReactNode
  label: string
  active?: boolean
  danger?: boolean
  disabled?: boolean
  onClick: () => void
}) {
  const tone = active
    ? "bg-stone-900 text-white"
    : danger
      ? "text-red-700 hover:bg-red-50"
      : "text-stone-700 hover:bg-stone-200"

  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={preventToolbarBlur}
      onClick={onClick}
      className={`flex h-8 min-w-8 items-center justify-center rounded-md px-2 text-xs transition disabled:text-stone-300 ${tone}`}
    >
      {children}
    </button>
  )
}

function preventToolbarBlur(event: React.MouseEvent<HTMLButtonElement>) {
  event.preventDefault()
}

function ensureFirstRowIsMarkdownHeader(editor: Editor) {
  const table = findTable(editor.state.selection.$from)
  const firstRow = table?.node.firstChild
  const headerType = editor.schema.nodes.tableHeader
  if (!table || !firstRow || !headerType) return

  const transaction = editor.state.tr
  let cellPosition = table.start + 1
  firstRow.forEach((cell) => {
    if (cell.type !== headerType) {
      transaction.setNodeMarkup(cellPosition, headerType, cell.attrs)
    }
    cellPosition += cell.nodeSize
  })
  if (transaction.docChanged) editor.view.dispatch(transaction)
}
