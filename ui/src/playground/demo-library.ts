import type { ComponentDemo, ComponentDemoModule, PlaygroundDemo } from "./demo";

function nonEmptyText(value: unknown, field: string, sourcePath: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Component demo '${sourcePath}' must have a non-empty ${field}`);
  }
  return value.trim();
}

function validateDemo(sourcePath: string, module: ComponentDemoModule): PlaygroundDemo {
  const candidate = module?.default as ComponentDemo | undefined;
  if (!candidate || typeof candidate !== "object") {
    throw new Error(`Component demo '${sourcePath}' must have a default demo export`);
  }
  const name = nonEmptyText(candidate.name, "name", sourcePath);
  const description = nonEmptyText(candidate.description, "description", sourcePath);
  if (!Array.isArray(candidate.scenarios) || candidate.scenarios.length === 0) {
    throw new Error(`Component demo '${sourcePath}' must define at least one scenario`);
  }

  const scenarioNames = new Set<string>();
  const scenarios = candidate.scenarios.map((scenario, index) => {
    if (!scenario || typeof scenario !== "object") {
      throw new Error(`Component demo '${sourcePath}' scenario ${index + 1} must be an object`);
    }
    const scenarioName = nonEmptyText(scenario.name, "scenario name", sourcePath);
    if (scenarioNames.has(scenarioName)) {
      throw new Error(`Component demo '${sourcePath}' has duplicate scenario '${scenarioName}'`);
    }
    if (typeof scenario.render !== "function") {
      throw new Error(`Component demo '${sourcePath}' scenario '${scenarioName}' must define render`);
    }
    scenarioNames.add(scenarioName);
    return {
      ...scenario,
      name: scenarioName,
      description: scenario.description?.trim() || undefined,
    };
  });

  return {
    id: sourcePath,
    sourcePath,
    name,
    description,
    scenarios: scenarios.sort((left, right) => left.name.localeCompare(right.name)),
  };
}

export function collectDemoLibrary(modules: Readonly<Record<string, ComponentDemoModule>>): readonly PlaygroundDemo[] {
  return Object.entries(modules)
    .map(([sourcePath, module]) => validateDemo(sourcePath, module))
    .sort((left, right) => left.name.localeCompare(right.name) || left.sourcePath.localeCompare(right.sourcePath));
}
