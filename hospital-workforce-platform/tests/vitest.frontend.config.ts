import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  root: path.resolve(__dirname, ".."),
  plugins: [react()],
  test: {
    name: "frontend",
    environment: "jsdom",
    globals: true,
    include: ["tests/frontend/**/*.test.tsx"],
    reporters: ["verbose"],
  },
});
