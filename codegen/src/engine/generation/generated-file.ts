import type { ApiModel, GeneratorId } from "../model/definitions.ts";

export type GeneratedFileFormat = "rust" | "typescript";

export interface GeneratedFile {
  readonly relativePath: string;
  readonly contents: string;
  readonly format: GeneratedFileFormat;
}

export interface CodeGenerator {
  readonly id: GeneratorId;
  readonly label: string;
  readonly description: string;
  generate(model: ApiModel): readonly GeneratedFile[];
}

export interface GeneratorModule {
  readonly default: CodeGenerator;
}

export function defineGenerator(input: {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly generate: (model: ApiModel) => readonly GeneratedFile[];
}): CodeGenerator {
  return Object.freeze({ ...input, id: input.id as GeneratorId });
}

export function isCodeGenerator(value: unknown): value is CodeGenerator {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    typeof value.id === "string" &&
    "label" in value &&
    typeof value.label === "string" &&
    "description" in value &&
    typeof value.description === "string" &&
    "generate" in value &&
    typeof value.generate === "function"
  );
}
