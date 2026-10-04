import { cruise, format } from "dependency-cruiser";
import config from "../../.dependency-cruiser.mjs";

const result = await cruise(["ui/src"], {
  ...config.options,
  validate: true,
  ruleSet: { forbidden: config.forbidden },
  outputType: "json",
});
const report = typeof result.output === "string" ? JSON.parse(result.output) : result.output;

if (!report.modules?.length) {
  console.error("Import boundary check scanned no modules; check TypeScript compatibility and source paths.");
  process.exitCode = 1;
} else {
  const formatted = await format(report, { outputType: "err-long" });
  process.stdout.write(String(formatted.output));
  process.exitCode = formatted.exitCode;
}
