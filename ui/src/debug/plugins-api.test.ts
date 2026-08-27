import { describe, expect, it, vi } from "vitest";

import { loadPlugins } from "./plugins-api";

const pluginMetadata = {
  plugins: [{
    name: "infra",
    description: "Infrastructure services",
    extension_points: ["info-providers"],
    extensions: ["package-info"],
  }],
  extension_points: [{
    id: "info-providers",
    description: "Contributes application information",
    extensions: ["package-info"],
  }],
  extensions: [{ id: "package-info", description: "Provides package information" }],
};

describe("loadPlugins", () => {
  it("loads plugin, extension point, and extension metadata", async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => pluginMetadata });

    await expect(loadPlugins(fetcher)).resolves.toEqual(pluginMetadata);
    expect(fetcher).toHaveBeenCalledWith("/api/plugins");
  });

  it("rejects incomplete relationship metadata", async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ...pluginMetadata, plugins: [{ name: "infra" }] }),
    });

    await expect(loadPlugins(fetcher)).rejects.toThrow("invalid response");
  });
});
