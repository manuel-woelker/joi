import type { GeneratorId } from "./model/definitions.ts";

export interface GeneratorTarget {
  readonly generator: GeneratorId;
  readonly outputRoot: string;
}

export const targets: readonly GeneratorTarget[] = Object.freeze([
  { generator: "rust" as GeneratorId, outputRoot: "examples/joix-tickets/src/generated" },
  { generator: "typescript" as GeneratorId, outputRoot: "ui/src/generated/api" },
]);
