import { afterEach, describe, expect, it, vi } from "vitest";

import { createApplication } from "./application-registry";

afterEach(() => vi.restoreAllMocks());

describe("createApplication", () => {
  it("reports how long UI plugin initialization took", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);

    createApplication();

    expect(info).toHaveBeenCalledOnce();
    expect(info).toHaveBeenCalledWith(expect.stringMatching(/^UI plugin system initialized in \d+\.\d{2} ms$/));
  });
});
