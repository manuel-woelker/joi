// @vitest-environment happy-dom

import { describe, expect, it } from "vitest";

import { createApplication } from "../../../../base/application-registry";
import { debugContributions } from "../core/contribution";

describe("table performance debug contribution", () => {
  it("registers in the debug tools", () => {
    const { registry } = createApplication();
    const entries = [...registry.extensionEntries(debugContributions)];
    expect(entries.map((entry) => entry.value.id)).toContain("table-performance");
  });
});
