import { glob, readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

const sourceRoot = path.resolve(import.meta.dirname, "..");

describe("UI domain boundaries", () => {
  it("prevents base, core, and the app shell from importing ticket code", async () => {
    const files = ["App.tsx", "Root.tsx"];
    for await (const file of glob(["base/**/*.{ts,tsx}", "plugins/core/**/*.{ts,tsx}"], { cwd: sourceRoot })) {
      files.push(file);
    }

    const violations: string[] = [];
    for (const file of files) {
      const source = await readFile(path.join(sourceRoot, file), "utf8");
      for (const specifier of relativeImports(source)) {
        const target = path.resolve(sourceRoot, path.dirname(file), specifier);
        if (target.includes(`${path.sep}plugins${path.sep}ticket${path.sep}`)) violations.push(`${file}: ${specifier}`);
      }
    }

    expect(violations).toEqual([]);
  });
});

function relativeImports(source: string): string[] {
  return [...source.matchAll(/(?:from\s+|import\s*)["'](\.[^"']+)["']/g)].map((match) => match[1]);
}
