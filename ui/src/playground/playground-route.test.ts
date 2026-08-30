import { describe, expect, it } from "vitest";

import type { PlaygroundDemo } from "./demo";
import { isPlaygroundHash, playgroundHash, selectPlaygroundRoute } from "./playground-route";

const library: readonly PlaygroundDemo[] = [
  {
    id: "../components/Badge.demo.tsx",
    sourcePath: "../components/Badge.demo.tsx",
    name: "Badge",
    description: "Labels",
    scenarios: [
      { name: "Long content", render: () => null },
      { name: "Tones", render: () => null },
    ],
  },
];

describe("playground route", () => {
  it("recognizes only the playground hash namespace", () => {
    expect(isPlaygroundHash("#playground")).toBe(true);
    expect(isPlaygroundHash("#playground/demo/scenario")).toBe(true);
    expect(isPlaygroundHash("#/views/view-active")).toBe(false);
  });

  it("round trips encoded demo and scenario names", () => {
    const hash = playgroundHash(library[0].id, "Long content");
    expect(selectPlaygroundRoute(hash, library)).toMatchObject({ demo: library[0], scenarioName: "Long content" });
  });

  it("falls back for bare and stale hashes", () => {
    expect(selectPlaygroundRoute("#playground", library)?.scenarioName).toBe("Long content");
    expect(selectPlaygroundRoute("#playground/missing/missing", library)?.scenarioName).toBe("Long content");
    expect(selectPlaygroundRoute("#playground/%E0%A4%A/missing", library)?.scenarioName).toBe("Long content");
    expect(selectPlaygroundRoute("#playground", [])).toBeUndefined();
  });
});
