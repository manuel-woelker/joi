import { defineConfig } from "vite";
import solidPlugin from "vite-plugin-solid";
import { viteSingleFile } from "vite-plugin-singlefile";

export default defineConfig({
  base: "./",
  plugins: [solidPlugin(), viteSingleFile()],
  server: {
    port: 5173,
    proxy: {
      "/api.json": "http://127.0.0.1:8787",
    },
  },
  build: {
    target: "es2022",
  },
});
