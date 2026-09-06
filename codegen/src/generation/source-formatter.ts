import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

import type { GeneratedFile } from "./generated-file.ts";

export function formatGeneratedFile(repositoryRoot: string, outputPath: string, file: GeneratedFile): GeneratedFile {
  const result =
    file.format === "typescript"
      ? spawnSync(
          process.execPath,
          [
            resolve(repositoryRoot, "ui/node_modules/@biomejs/biome/bin/biome"),
            "format",
            "--stdin-file-path",
            outputPath,
          ],
          { cwd: repositoryRoot, input: file.contents, encoding: "utf8" },
        )
      : spawnSync("./t", ["rustfmt", "--edition", "2024", "--emit", "stdout"], {
          cwd: repositoryRoot,
          env: { ...process.env, PATH: "/usr/bin:/bin" },
          input: file.contents,
          encoding: "utf8",
        });

  if (result.status !== 0) {
    throw new Error(
      `Failed to format ${outputPath}: ${(result.stderr || result.error?.message || "unknown error").trim()}`,
    );
  }
  return Object.freeze({ ...file, contents: result.stdout });
}
