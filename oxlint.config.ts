import type { Oxlintrc } from "oxlint"

export default {
  plugins: ["eslint", "typescript", "unicorn", "oxc"],
  categories: {
    correctness: "error",
    suspicious: "warn",
    perf: "warn",
  },
  ignorePatterns: ["dist", "convex/_generated", "node_modules"],
} satisfies Oxlintrc
