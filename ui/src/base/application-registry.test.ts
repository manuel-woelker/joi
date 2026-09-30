// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from "vitest";

import { createApplication } from "./application-registry";
import { linkTargetProviders } from "../plugins/core/links/link-targets";

afterEach(() => vi.restoreAllMocks());

describe("createApplication", () => {
  it("reports how long UI plugin initialization took", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);

    createApplication();

    expect(info).toHaveBeenCalledOnce();
    expect(info).toHaveBeenCalledWith(expect.stringMatching(/^UI plugin system initialized in \d+\.\d{2} ms$/));
  });

  it("discovers the entity-link providers used by the editor", () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    const application = createApplication();
    expect(
      application.registry
        .extensions(linkTargetProviders)
        .map((provider) => provider.type)
        .sort(),
    ).toEqual(["commit", "ticket", "user", "wiki"]);
  });
});
