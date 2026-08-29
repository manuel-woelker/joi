/// <reference types="vitest/config" />

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vite";
import solidPlugin from "vite-plugin-solid";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));

function git(...arguments_: string[]): string {
  const result = spawnSync("git", arguments_, { cwd: repositoryRoot, encoding: "utf8" });
  const output = result.stdout.trim();
  if (output) return output;
  throw result.error ?? new Error(`git ${arguments_.join(" ")} failed`);
}

const revision = `${git("log", "-1", "--format=%H").slice(0, 8)} ${git("log", "-1", "--format=%cI")}${git("status", "--porcelain") ? "-dev" : ""}`;

export default defineConfig({
  define: {
    __JOI_REVISION__: JSON.stringify(revision),
  },
  plugins: [solidPlugin()],
  server: {
    proxy: {
      "/api": "http://127.0.0.1:3000",
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test-setup.ts"],
  },
  build: {
    target: "es2022",
  },
});
