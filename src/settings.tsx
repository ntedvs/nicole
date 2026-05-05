"use client"

import { useMutation, useQuery } from "convex/react"
import { useEffect, useState } from "react"
import { api } from "../convex/_generated/api"

const PRESETS = [
  { name: "Amber", hex: "78350f" },
  { name: "Oxblood", hex: "7f1d1d" },
  { name: "Forest", hex: "14532d" },
  { name: "Teal", hex: "115e59" },
  { name: "Indigo", hex: "312e81" },
  { name: "Plum", hex: "581c87" },
  { name: "Terracotta", hex: "9a3412" },
  { name: "Slate", hex: "1e293b" },
]

const HEX_RE = /^[0-9a-fA-F]{6}$/
const DEFAULT_HEX = "78350f"

export function SettingsPage() {
  const settings = useQuery(api.settings.get)
  const setLinkColor = useMutation(api.settings.setLinkColor)
  const stored = settings?.linkColor ?? null

  const [draft, setDraft] = useState<string>(DEFAULT_HEX)
  const [savedFlash, setSavedFlash] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    if (!hydrated && settings !== undefined) {
      setDraft(stored ?? DEFAULT_HEX)
      setHydrated(true)
    }
  }, [settings, stored, hydrated])

  const normalized = draft.replace(/^#/, "").toLowerCase()
  const valid = HEX_RE.test(normalized)
  const dirty = valid && normalized !== (stored ?? DEFAULT_HEX)
  const previewColor = valid ? `#${normalized}` : `#${DEFAULT_HEX}`

  const save = async () => {
    if (!valid) return
    try {
      await setLinkColor({ color: normalized })
      setError(null)
      setSavedFlash(true)
      setTimeout(() => setSavedFlash(false), 1400)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save")
    }
  }

  return (
    <div
      className="min-h-full bg-stone-50"
      style={{ ["--wiki-link-color" as string]: previewColor }}
    >
      <div className="mx-auto max-w-3xl px-10 py-16">
        <p className="mb-2 font-serif text-xs tracking-[0.3em] text-stone-400 uppercase italic">
          Settings · Appearance
        </p>
        <h1 className="font-serif text-5xl text-stone-900">Link color</h1>
        <p className="mt-3 max-w-lg font-serif text-lg text-stone-500 italic">
          The color used when notes link to other notes. Choose something that
          feels like yours.
        </p>

        <div className="mt-12 grid grid-cols-[auto_1fr] gap-10">
          <div
            className="h-44 w-44 rounded-full shadow-[inset_0_2px_8px_rgba(0,0,0,0.15),0_8px_24px_-12px_rgba(0,0,0,0.4)]"
            style={{ background: previewColor }}
            aria-hidden
          />
          <div className="flex flex-col justify-center gap-5">
            <label className="block">
              <span className="mb-1.5 block font-serif text-xs tracking-widest text-stone-500 uppercase">
                Hex value
              </span>
              <div className="flex items-baseline gap-2 border-b border-stone-300 pb-1 focus-within:border-stone-900">
                <span className="font-mono text-2xl text-stone-400">#</span>
                <input
                  className="w-44 bg-transparent font-mono text-2xl tracking-wider text-stone-900 focus:outline-none"
                  value={draft.replace(/^#/, "")}
                  onChange={(e) => {
                    setDraft(e.target.value.slice(0, 6))
                    setError(null)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && dirty) void save()
                  }}
                  placeholder={DEFAULT_HEX}
                  spellCheck={false}
                  maxLength={6}
                />
              </div>
              {!valid && draft.length > 0 && (
                <span className="mt-1 inline-block text-xs text-red-600">
                  Six hex characters, please.
                </span>
              )}
            </label>

            <div>
              <span className="mb-2 block font-serif text-xs tracking-widest text-stone-500 uppercase">
                Or pick one
              </span>
              <div className="flex flex-wrap gap-2">
                {PRESETS.map((p) => {
                  const active = normalized === p.hex
                  return (
                    <button
                      key={p.hex}
                      type="button"
                      onClick={() => {
                        setDraft(p.hex)
                        setError(null)
                      }}
                      title={`${p.name} · #${p.hex}`}
                      className={`group h-9 w-9 rounded-full transition ${active ? "ring-2 ring-stone-900 ring-offset-2" : "hover:scale-110"}`}
                      style={{ background: `#${p.hex}` }}
                      aria-label={p.name}
                    />
                  )
                })}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-14 border-t border-stone-200 pt-8">
          <p className="mb-3 font-serif text-xs tracking-widest text-stone-400 uppercase">
            Preview
          </p>
          <div className="wiki-editor rounded-2xl border border-stone-200 bg-white px-8 py-7">
            <p className="font-serif text-lg leading-relaxed text-stone-800">
              The fox slipped past{" "}
              <a href="#preview" onClick={(e) => e.preventDefault()}>
                the old well
              </a>
              , glanced at{" "}
              <a href="#preview" onClick={(e) => e.preventDefault()}>
                yesterday&rsquo;s notes
              </a>
              , and disappeared into the hedgerow.
            </p>
          </div>
          <style>{`
            .wiki-editor a {
              color: var(--wiki-link-color);
              padding: 0 2px;
              border-radius: 3px;
              text-decoration: none;
              border-bottom: 1px solid color-mix(in srgb, var(--wiki-link-color) 50%, transparent);
            }
            .wiki-editor a:hover {
              background: color-mix(in srgb, var(--wiki-link-color) 12%, transparent);
            }
          `}</style>
        </div>

        <div className="mt-10 flex items-center gap-4">
          <button
            type="button"
            onClick={() => void save()}
            disabled={!dirty || !valid}
            className="rounded-full bg-stone-900 px-7 py-2.5 text-sm tracking-wide text-white transition hover:bg-stone-700 disabled:cursor-not-allowed disabled:bg-stone-300"
          >
            Save color
          </button>
          {savedFlash && (
            <span className="font-serif text-sm text-stone-500 italic">
              Saved.
            </span>
          )}
          {error && <span className="text-sm text-red-600">{error}</span>}
        </div>
      </div>
    </div>
  )
}
