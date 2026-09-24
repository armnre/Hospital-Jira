import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  root: path.resolve(__dirname, ".."),
  test: {
    name: "backend",
    environment: "node",
    globals: true,
    include: ["tests/backend/**/*.test.ts"],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    fileParallelism: false,
    reporters: ["verbose"],
  },
});
