import { describe, expect, it, vi } from "vitest";

import { BackendPluginsService } from "./plugins-api";
import { FetchService } from "../../../services/fetch-service";

const pluginMetadata = {
  plugins: [
    {
      name: "infra",
      description: "Infrastructure services",
      extension_points: ["info-providers"],
      extensions: ["package-info"],
    },
  ],
  extension_points: [
    {
      id: "info-providers",
      description: "Contributes application information",
      extensions: ["package-info"],
    },
  ],
  extensions: [{ id: "package-info", description: "Provides package information" }],
};

describe("BackendPluginsService", () => {
  it("loads plugin, extension point, and extension metadata", async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => pluginMetadata });

    const service = new BackendPluginsService({ fetchService: new FetchService(fetcher) });
    await expect(service.load()).resolves.toEqual(pluginMetadata);
    expect(fetcher).toHaveBeenCalledWith("/api/plugins", { method: "GET" });
  });

  it("rejects incomplete relationship metadata", async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ...pluginMetadata, plugins: [{ name: "infra" }] }),
    });

    const service = new BackendPluginsService({ fetchService: new FetchService(fetcher) });
    await expect(service.load()).rejects.toThrow("invalid response");
  });
});
