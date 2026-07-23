import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/*.test.js"]
  },
  build: {
    outDir: "dist",
    sourcemap: true
  },
  server: {
    port: 3000,
    strictPort: true
  },
  preview: {
    port: 4173,
    strictPort: true
  }
});
