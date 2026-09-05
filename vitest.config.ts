import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  test: {
    // Node by default: almost everything here is pure logic and a DOM would
    // only slow it down. The component tests opt into jsdom per file with a
    // @vitest-environment docblock.
    environment: "node",
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    setupFiles: ["tests/setup.ts"],
    hookTimeout: 120_000,
    testTimeout: 60_000,
    fileParallelism: false,
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "@db": fileURLToPath(new URL("./db", import.meta.url)),
      // Next.js's server-only guard throws when imported outside a server
      // component. Tests run under plain Node, so it is stubbed here.
      "server-only": fileURLToPath(new URL("./tests/stubs/server-only.ts", import.meta.url)),
    },
  },
});
