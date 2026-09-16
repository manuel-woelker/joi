/// <reference types="vitest/config" />

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vite";
import solidPlugin from "vite-plugin-solid";

import { sourceLocationTransform } from "./source-location-transform.ts";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));

function git(...arguments_: string[]): string {
  const result = spawnSync("git", arguments_, { cwd: repositoryRoot, encoding: "utf8" });
  if (result.status === 0) return result.stdout.trim();
  throw result.error ?? new Error(`git ${arguments_.join(" ")} failed: ${result.stderr.trim()}`);
}

const revision =
  process.env.JOI_REVISION ??
  (process.env.VITEST
    ? "test"
    : `${git("log", "-1", "--format=%H").slice(0, 8)} ${git("log", "-1", "--format=%cI")}${git("status", "--porcelain") ? "-dev" : ""}`);

export default defineConfig({
  define: {
    __JOI_REVISION__: JSON.stringify(revision),
  },
  plugins: [sourceLocationTransform(repositoryRoot), solidPlugin()],
  optimizeDeps: {
    include: ["prosemirror-model", "prosemirror-state", "prosemirror-transform", "prosemirror-view"],
  },
  resolve: {
    dedupe: ["prosemirror-model", "prosemirror-state", "prosemirror-transform", "prosemirror-view"],
  },
  server: {
    proxy: {
      "/api": "http://127.0.0.1:3000",
    },
  },
  test: {
    environment: "node",
    setupFiles: ["./src/test-setup.ts"],
  },
  build: {
    target: "es2022",
  },
});
