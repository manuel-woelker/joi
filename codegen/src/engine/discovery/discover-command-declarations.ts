import { glob } from "node:fs/promises";
import { pathToFileURL } from "node:url";

import { isCommandDeclaration } from "../model/declarations.ts";
import type { SourcedCommandDeclaration } from "../model/model-builder.ts";
import { containedDiscoveryPath } from "./contained-discovery-path.ts";

export type ModuleLoader = (url: string) => Promise<unknown>;

export async function discoverCommandDeclarations(
  root: string,
  pattern = "src/declarations/**/*.command.ts",
  load: ModuleLoader = (url) => import(url),
): Promise<readonly SourcedCommandDeclaration[]> {
  const paths: string[] = [];
  for await (const path of glob(pattern, { cwd: root })) paths.push(path);

  return Promise.all(
    paths.sort().map(async (path) => {
      const absolutePath = containedDiscoveryPath(root, path);
      const loaded = await load(pathToFileURL(absolutePath).href);
      const candidate =
        typeof loaded === "object" && loaded !== null && "default" in loaded ? loaded.default : undefined;
      if (!isCommandDeclaration(candidate)) throw new Error(`${path}: default export is not a command declaration`);
      return Object.freeze({ declaration: candidate, sourcePath: path });
    }),
  );
}
