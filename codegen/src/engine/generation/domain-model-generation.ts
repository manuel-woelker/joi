import { glob } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { isEntityType } from "@joi/domain";
import { describeModel } from "@joi/domain/model-description";

import { removeGeneratedOutput, synchronizeOutput, type OutputMode } from "./output-writer.ts";

export async function generateDomainModels(repositoryRoot: string, mode: OutputMode): Promise<readonly string[]> {
  const issues: string[] = [];
  for await (const path of glob("domains/*/definitions/data-model.ts", { cwd: repositoryRoot })) {
    const domain = path.split(/[\\/]/)[1];
    const outputRoot = resolve(repositoryRoot, "domains", domain, "generated");
    const module: Record<string, unknown> = await import(pathToFileURL(resolve(repositoryRoot, path)).href);
    const entities = Object.values(module).filter(isEntityType);
    if (entities.length === 0) throw new Error(`${path} does not export any entity definitions`);
    const description = describeModel(entities);
    issues.push(
      ...(await synchronizeOutput(
        outputRoot,
        [{ relativePath: "model.json", contents: `${JSON.stringify(description, null, 2)}\n`, format: "typescript" }],
        mode,
      )),
    );
  }
  return issues;
}

export async function removeGeneratedDomainModels(repositoryRoot: string): Promise<readonly string[]> {
  const removed: string[] = [];
  for await (const path of glob("domains/*/generated", { cwd: repositoryRoot })) {
    removed.push(...(await removeGeneratedOutput(join(repositoryRoot, path))));
  }
  return removed;
}
