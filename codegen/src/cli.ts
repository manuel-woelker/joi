import { fileURLToPath } from "node:url";

import { targets } from "./codegen.config.ts";
import { runGeneration } from "./generation/generation-runner.ts";
import type { OutputMode } from "./generation/output-writer.ts";

const codegenRoot = fileURLToPath(new URL("..", import.meta.url));
const repositoryRoot = fileURLToPath(new URL("../..", import.meta.url));
const mode = process.argv[2];

if (mode !== "generate" && mode !== "check") {
  console.error("Usage: node src/cli.ts <generate|check>");
  process.exitCode = 2;
} else {
  try {
    const issues = await runGeneration({ codegenRoot, repositoryRoot, mode: mode as OutputMode, targets });
    if (mode === "check" && issues.length > 0) {
      console.error(issues.join("\n"));
      console.error("Run the codegen-generate task to update generated files.");
      process.exitCode = 1;
    } else if (mode === "generate") {
      console.log(`Generated ${targets.length} targets${issues.length > 0 ? ` (${issues.length} updated)` : ""}.`);
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
