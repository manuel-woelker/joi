import { glob } from "node:fs/promises";
import { pathToFileURL } from "node:url";

import { isCodeGenerator, type CodeGenerator } from "../generation/generated-file.ts";
import { requireIdentifier, requireText } from "../model/model-validation.ts";
import { containedDiscoveryPath } from "./contained-discovery-path.ts";
import type { ModuleLoader } from "./discover-command-declarations.ts";

export async function discoverGenerators(
  root: string,
  pattern = "src/generators/**/*.generator.ts",
  load: ModuleLoader = (url) => import(url),
): Promise<readonly CodeGenerator[]> {
  const paths: string[] = [];
  for await (const path of glob(pattern, { cwd: root })) paths.push(path);
  const ids = new Map<string, string>();
  const generators: CodeGenerator[] = [];

  for (const path of paths.sort()) {
    const loaded = await load(pathToFileURL(containedDiscoveryPath(root, path)).href);
    const candidate = typeof loaded === "object" && loaded !== null && "default" in loaded ? loaded.default : undefined;
    if (!isCodeGenerator(candidate)) throw new Error(`${path}: default export is not a code generator`);
    const diagnostics: string[] = [];
    requireIdentifier(candidate.id, `${path}: generator.id`, diagnostics);
    requireText(candidate.label, `${path}: generator.label`, diagnostics);
    requireText(candidate.description, `${path}: generator.description`, diagnostics);
    const previous = ids.get(candidate.id);
    if (previous) diagnostics.push(`${path}: generator.id '${candidate.id}' duplicates ${previous}`);
    if (diagnostics.length > 0) throw new Error(diagnostics.join("\n"));
    ids.set(candidate.id, path);
    generators.push(candidate);
  }

  return Object.freeze(generators.sort((left, right) => left.id.localeCompare(right.id)));
}
