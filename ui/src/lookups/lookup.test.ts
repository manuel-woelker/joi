import { describe, expect, it, vi } from "vitest";

import { PluginRegistryBuilder, plugin } from "../plugins/registry";
import { LookupService, lookupDefinitions, lookupEntryId, lookupId, type LookupEntry } from "./lookup";

function registryWithLookup(load: () => Promise<readonly LookupEntry[]>) {
  return new PluginRegistryBuilder()
    .register(
      plugin({
        name: "lookup-point",
        description: "Test lookup point",
        registerExtensionPoints(context) {
          context.registerExtensionPoint({ point: lookupDefinitions });
        },
      }),
    )
    .register(
      plugin({
        name: "lookup-value",
        description: "Test lookup",
        registerExtensions(context) {
          context.registerExtension({
            point: lookupDefinitions,
            id: "people-lookup",
            description: "Test people",
            value: { id: lookupId("people"), label: "Person", load },
          });
        },
      }),
    )
    .build();
}

describe("LookupService", () => {
  it("loads each lookup once and resolves labels", async () => {
    const load = vi.fn(async () => [{ id: lookupEntryId("user-1"), label: "Jane Developer" }]);
    const service = new LookupService(registryWithLookup(load));

    await expect(
      Promise.all([service.label(lookupId("people"), lookupEntryId("user-1")), service.entries(lookupId("people"))]),
    ).resolves.toEqual(["Jane Developer", [{ id: "user-1", label: "Jane Developer" }]]);
    expect(load).toHaveBeenCalledOnce();
  });

  it("falls back to the stored value when an ID is unknown", async () => {
    const service = new LookupService(registryWithLookup(async () => []));
    await expect(service.label(lookupId("people"), lookupEntryId("missing-user"))).resolves.toBe("missing-user");
  });

  it("allows retrying a failed load", async () => {
    const load = vi
      .fn<() => Promise<readonly LookupEntry[]>>()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce([]);
    const service = new LookupService(registryWithLookup(load));

    await expect(service.entries(lookupId("people"))).rejects.toThrow("offline");
    await expect(service.entries(lookupId("people"))).resolves.toEqual([]);
    expect(load).toHaveBeenCalledTimes(2);
  });
});
