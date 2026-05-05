"use client"

import { useAuthActions } from "@convex-dev/auth/react"
import { useState } from "react"

export function SignInForm() {
  const { signIn } = useAuthActions()
  const [flow, setFlow] = useState<"signIn" | "signUp">("signIn")
  const [error, setError] = useState<string | null>(null)
  return (
    <div className="flex min-h-screen items-center justify-center bg-stone-50">
      <form
        className="w-full max-w-sm space-y-4 rounded-2xl border border-stone-200 bg-white p-8 shadow-sm"
        onSubmit={(e) => {
          e.preventDefault()
          const formData = new FormData(e.target as HTMLFormElement)
          formData.set("flow", flow)
          void signIn("password", formData).catch((err) =>
            setError(err.message),
          )
        }}
      >
        <h1 className="font-serif text-2xl">
          {flow === "signIn" ? "Welcome back" : "Create your notebook"}
        </h1>
        <input
          className="w-full rounded-lg border border-stone-300 px-3 py-2 focus:ring-2 focus:ring-stone-400 focus:outline-none"
          type="email"
          name="email"
          placeholder="Email"
          required
        />
        <input
          className="w-full rounded-lg border border-stone-300 px-3 py-2 focus:ring-2 focus:ring-stone-400 focus:outline-none"
          type="password"
          name="password"
          placeholder="Password"
          required
        />
        <button
          type="submit"
          className="w-full rounded-lg bg-stone-900 py-2 text-white transition hover:bg-stone-800"
        >
          {flow === "signIn" ? "Sign in" : "Sign up"}
        </button>
        <button
          type="button"
          className="w-full text-sm text-stone-500 hover:text-stone-800"
          onClick={() => setFlow(flow === "signIn" ? "signUp" : "signIn")}
        >
          {flow === "signIn"
            ? "Need an account? Sign up"
            : "Have an account? Sign in"}
        </button>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </form>
    </div>
  )
}
