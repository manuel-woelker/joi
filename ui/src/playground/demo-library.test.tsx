import { describe, expect, it } from "vitest";

import type { ComponentDemoModule } from "./demo";
import { collectDemoLibrary } from "./demo-library";

const moduleWith = (name: string, scenarios = ["Default"]): ComponentDemoModule => ({
  default: {
    name,
    description: `${name} description`,
    scenarios: scenarios.map((scenario) => ({ name: scenario, render: () => <span>{scenario}</span> })),
  },
});

describe("collectDemoLibrary", () => {
  it("uses source paths as IDs and sorts demos and scenarios", () => {
    const library = collectDemoLibrary({
      "./Zeta.demo.tsx": moduleWith("Zeta", ["Second", "First"]),
      "./Alpha.demo.tsx": moduleWith("Alpha"),
    });

    expect(library.map((demo) => demo.name)).toEqual(["Alpha", "Zeta"]);
    expect(library[0].id).toBe("./Alpha.demo.tsx");
    expect(library[1].scenarios.map((scenario) => scenario.name)).toEqual(["First", "Second"]);
  });

  it.each([
    ["missing default export", { "./Broken.demo.tsx": {} }, "default demo export"],
    [
      "empty name",
      {
        "./Broken.demo.tsx": {
          default: { name: "", description: "Description", scenarios: [{ name: "Default", render: () => null }] },
        },
      },
      "non-empty name",
    ],
    [
      "empty description",
      {
        "./Broken.demo.tsx": {
          default: { name: "Broken", description: "", scenarios: [{ name: "Default", render: () => null }] },
        },
      },
      "non-empty description",
    ],
    [
      "no scenarios",
      { "./Broken.demo.tsx": { default: { name: "Broken", description: "Description", scenarios: [] } } },
      "at least one scenario",
    ],
    [
      "duplicate scenarios",
      {
        "./Broken.demo.tsx": {
          default: {
            name: "Broken",
            description: "Description",
            scenarios: [
              { name: "Same", render: () => null },
              { name: "Same", render: () => null },
            ],
          },
        },
      },
      "duplicate scenario 'Same'",
    ],
  ])("rejects %s", (_name, modules, message) => {
    expect(() => collectDemoLibrary(modules as Record<string, ComponentDemoModule>)).toThrow(message);
  });

  it("allows an empty discovered library", () => {
    expect(collectDemoLibrary({})).toEqual([]);
  });
});
