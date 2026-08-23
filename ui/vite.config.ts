/// <reference types="vitest/config" />

import { defineConfig } from "vite";
import solidPlugin from "vite-plugin-solid";

export default defineConfig({
  plugins: [solidPlugin()],
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test-setup.ts"],
  },
  build: {
    target: "es2022",
  },
});
