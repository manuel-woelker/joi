import { resolve } from "node:path";

import type { GeneratorId } from "../model/definitions.ts";
import { discoverCommandDeclarations } from "../discovery/discover-command-declarations.ts";
import { discoverGenerators } from "../discovery/discover-generators.ts";
import { buildModel } from "../model/model-builder.ts";
import { formatGeneratedFile } from "./source-formatter.ts";
import { synchronizeOutput, type OutputMode } from "./output-writer.ts";

export interface GenerationTarget {
  readonly generator: GeneratorId;
  readonly outputRoot: string;
}

export async function runGeneration(options: {
  readonly codegenRoot: string;
  readonly repositoryRoot: string;
  readonly mode: OutputMode;
  readonly targets: readonly GenerationTarget[];
}): Promise<readonly string[]> {
  const declarations = await discoverCommandDeclarations(options.codegenRoot);
  const model = buildModel(declarations);
  const generators = await discoverGenerators(options.codegenRoot);
  const byId = new Map(generators.map((generator) => [generator.id, generator]));
  const issues: string[] = [];

  for (const target of [...options.targets].sort((left, right) => left.generator.localeCompare(right.generator))) {
    const generator = byId.get(target.generator);
    if (!generator) throw new Error(`Configured generator '${target.generator}' was not discovered`);
    const outputRoot = resolve(options.repositoryRoot, target.outputRoot);
    const generated = generator
      .generate(model)
      .map((file) => formatGeneratedFile(options.repositoryRoot, resolve(outputRoot, file.relativePath), file));
    issues.push(...(await synchronizeOutput(outputRoot, generated, options.mode)));
  }

  return Object.freeze(issues);
}
