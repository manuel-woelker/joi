import { describe, expect, it, vi } from "vitest";

import type { PluginRegistry } from "./plugin-registry";
import { createPluginRegistryService } from "./plugin-registry-service";

describe("PluginRegistryService", () => {
  it("fails before the registry is initialized", () => {
    const service = createPluginRegistryService().service;

    expect(() => service.metadata()).toThrow("Plugin registry is not initialized");
    expect(() => service.extensionEntries({} as never)).toThrow("Plugin registry is not initialized");
  });

  it("delegates after initialization", () => {
    const controller = createPluginRegistryService();
    const registry = {
      extensions: vi.fn().mockReturnValue(["extension"]),
      extensionEntries: vi.fn().mockReturnValue([{ id: "extension", value: "extension" }]),
      metadata: vi.fn().mockReturnValue({ plugins: [], extensionPoints: [], extensions: [] }),
    } as unknown as PluginRegistry;

    controller.setRegistry(registry);

    expect(controller.service.metadata()).toEqual({ plugins: [], extensionPoints: [], extensions: [] });
    expect(controller.service.extensions({} as never)).toEqual(["extension"]);
    expect(controller.service.extensionEntries({} as never)).toEqual([{ id: "extension", value: "extension" }]);
    expect(registry.metadata).toHaveBeenCalledOnce();
    expect(registry.extensions).toHaveBeenCalledOnce();
    expect(registry.extensionEntries).toHaveBeenCalledOnce();
  });

  it("rejects replacing the initialized registry", () => {
    const controller = createPluginRegistryService();
    const registry = {} as PluginRegistry;

    controller.setRegistry(registry);

    expect(() => controller.setRegistry(registry)).toThrow("already initialized");
  });
});
