import type { GenerationTarget } from "./engine/generation/generation-runner.ts";
import type { GeneratorId } from "./engine/model/definitions.ts";

export const targets: readonly GenerationTarget[] = Object.freeze([
  { generator: "rust" as GeneratorId, outputRoot: "libs-rust/joi-server/src/generated" },
  { generator: "typescript" as GeneratorId, outputRoot: "ui/src/generated" },
]);
