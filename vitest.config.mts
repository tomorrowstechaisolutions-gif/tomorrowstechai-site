import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Pure-logic tests only. Nothing here renders a component or talks to a
// database: the validator, the rollup maths and the link-safety rule.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/__tests__/**/*.test.ts"],
  },
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
});
