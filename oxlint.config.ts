import { defineConfig } from "oxlint"

export default defineConfig({
  plugins: [
    "typescript",
    "unicorn",
    "react",
    "react-perf",
    "oxc",
    "import",
    "jsx-a11y",
    "node",
    "promise",
  ],
})
