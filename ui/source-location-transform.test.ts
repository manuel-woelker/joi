import { describe, expect, it } from "vitest";

import { injectSourceLocations } from "./source-location-transform";

describe("source location transform", () => {
  it("adds locations to plugin registration APIs", () => {
    const source = [
      'export default plugin({ name: "tickets", description: "Tickets" });',
      "context.registerExtensionPoint({ point });",
      'context.registerExtension({ point, id: "list", description: "List", value });',
    ].join("\n");

    const transformed = injectSourceLocations(source, "/repo/ui/src/tickets.plugin.ts", "/repo");

    expect(transformed).toContain('plugin({ location: { file: "ui/src/tickets.plugin.ts", line: 1 },');
    expect(transformed).toContain('registerExtensionPoint({ location: { file: "ui/src/tickets.plugin.ts", line: 2 },');
    expect(transformed).toContain('registerExtension({ location: { file: "ui/src/tickets.plugin.ts", line: 3 },');
  });

  it("preserves explicit locations and unrelated calls", () => {
    const source = [
      'plugin({ location: { file: "manual.ts", line: 4 }, name: "manual", description: "Manual" });',
      "service.register({ value: 1 });",
    ].join("\n");

    expect(injectSourceLocations(source, "/repo/ui/src/manual.ts", "/repo")).toBe(source);
  });

  it("recognizes registration calls split across lines", () => {
    const source = "context.registerExtensionPoint\n({ point });";

    expect(injectSourceLocations(source, "/repo/ui/src/core.plugin.ts", "/repo")).toContain(
      'location: { file: "ui/src/core.plugin.ts", line: 1 }',
    );
  });
});
