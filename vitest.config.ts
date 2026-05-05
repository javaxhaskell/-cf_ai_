import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    coverage: {
      provider: "v8",
      include: [
        "src/server/format.ts",
        "src/server/briefings.ts",
        "src/server/mcp.ts",
        "src/server/prompts/**/*.ts",
        "src/server/tools/llm.ts",
        "src/server/tools/web-search.ts",
        "src/server/tools/web-fetch.ts",
        "src/server/memory/kv.ts",
      ],
      reporter: ["text", "html"],
      thresholds: {
        lines: 70,
        functions: 70,
        statements: 70,
      },
    },
  },
  resolve: {
    alias: {
      "@server": path.resolve(__dirname, "src/server"),
    },
  },
});
