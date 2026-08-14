import { defineConfig } from "vitest/config";

// Unit tests for pure logic (pathway + AI-output validation). DOM/browser tests
// are handled separately; these run in a plain node environment.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
