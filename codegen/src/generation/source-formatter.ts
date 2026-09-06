import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import type { GeneratedFile } from "./generated-file.ts";

export function formatGeneratedFile(repositoryRoot: string, outputPath: string, file: GeneratedFile): GeneratedFile {
  if (file.format === "rust") return formatRust(repositoryRoot, outputPath, file);
  const result = spawnSync(
    process.execPath,
    [resolve(repositoryRoot, "ui/node_modules/@biomejs/biome/bin/biome"), "format", "--stdin-file-path", outputPath],
    { cwd: repositoryRoot, input: file.contents, encoding: "utf8" },
  );

  if (result.status !== 0) {
    throw new Error(
      `Failed to format ${outputPath}: ${(result.stderr || result.error?.message || "unknown error").trim()}`,
    );
  }
  return Object.freeze({ ...file, contents: result.stdout });
}

function formatRust(repositoryRoot: string, outputPath: string, file: GeneratedFile): GeneratedFile {
  const directory = mkdtempSync(resolve(tmpdir(), "joi-codegen-rustfmt-"));
  const temporaryPath = resolve(directory, "generated.rs");
  try {
    writeFileSync(temporaryPath, file.contents);
    const rustfmt = process.env.RUSTFMT;
    if (!rustfmt) throw new Error(`Failed to format ${outputPath}: RUSTFMT is not configured`);
    const result = spawnSync(rustfmt, ["--edition", "2024", "--config", "skip_children=true", temporaryPath], {
      cwd: repositoryRoot,
      env: { ...process.env, PATH: "/usr/bin:/bin" },
      encoding: "utf8",
    });
    if (result.status !== 0) {
      throw new Error(
        `Failed to format ${outputPath}: ${(result.stderr || result.error?.message || "unknown error").trim()}`,
      );
    }
    return Object.freeze({ ...file, contents: readFileSync(temporaryPath, "utf8") });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}
