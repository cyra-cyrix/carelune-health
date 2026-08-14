import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Unit tests. Pure-logic tests (pathway/AI-output validation) run in a plain node
// environment; component tests opt into jsdom per-file via `// @vitest-environment
// jsdom`. The React plugin enables the automatic JSX runtime for .tsx tests.
export default defineConfig({
  plugins: [react()],
  test: {
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    environment: "node",
  },
});
