// @vitest-environment happy-dom

import { waitFor } from "@solidjs/testing-library";
import { createRoot } from "solid-js";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createApplication } from "../../base/application-registry";
import { createNavigationController } from "../../base/navigation";
import { FetchService } from "../../base/services/fetch-service";
import administrationPlugin from "../core/administration/administration.plugin";
import entitiesPlugin from "../core/entities/entities.plugin";
import { navigationSection } from "../core/navigation/contribution";
import navigationPlugin from "../core/navigation/navigation.plugin";
import { leafEntries } from "../core/navigation/recent-views";
import { resolveApplicationView } from "../core/shell/ApplicationShell";
import shellPlugin from "../core/shell/shell.plugin";
import codevettePlugin, { branchViewId, parseBranchViewId } from "./codevette.plugin";

afterEach(() => {
  vi.restoreAllMocks();
});

function stringColumn(attribute: string, values: string[]) {
  return { attribute, values: { type: "string", values } };
}

const tables: Record<string, { attribute: string; values: string[] }[]> = {
  repositories: [
    { attribute: "id", values: ["repo-1"] },
    { attribute: "key", values: ["joi"] },
    { attribute: "name", values: ["Joi"] },
  ],
  repository_branches: [
    { attribute: "id", values: ["branch-1", "branch-2"] },
    { attribute: "repository_id", values: ["repo-1", "repo-1"] },
    { attribute: "name", values: ["main", "feature/login"] },
  ],
};

const fetchService = new FetchService(async (_input, init) => {
  const request = JSON.parse(String(init?.body)) as { table_name: string };
  const columns = tables[request.table_name] ?? [];
  return {
    ok: true,
    json: async () => ({
      results: [
        {
          type: "rows",
          result_columns: columns.map(({ attribute, values }) => stringColumn(attribute, values)),
        },
      ],
    }),
  } as Response;
});

describe("branch view ids", () => {
  it("builds and parses readable branch paths", () => {
    expect(branchViewId("joi", "main")).toBe("branches/joi/main");
    expect(parseBranchViewId("branches/joi/main")).toEqual({ repositoryKey: "joi", branchName: "main" });
    expect(parseBranchViewId("branches/joi/feature/login")).toEqual({
      repositoryKey: "joi",
      branchName: "feature/login",
    });
    expect(parseBranchViewId("branches/joi")).toBeUndefined();
    expect(parseBranchViewId("codevette-branch/branch-1")).toBeUndefined();
  });
});

describe("codevette branch urls", () => {
  it("exposes branches under readable repo/branch view ids and resolves them", async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    const application = createApplication({
      plugins: [shellPlugin, entitiesPlugin, navigationPlugin, administrationPlugin, codevettePlugin],
      fetchService,
    });
    const section = application.registry
      .extensions(navigationSection)
      .find((candidate) => candidate.id === "codevette");
    expect(section).toBeTruthy();

    await waitFor(() => expect(leafEntries(section!.roots()).length).toBe(2));

    expect(leafEntries(section!.roots()).map((leaf) => leaf.selection)).toEqual([
      { type: "view", id: "branches/joi/main" },
      { type: "view", id: "branches/joi/feature/login" },
    ]);

    const view = resolveApplicationView(application.registry, { type: "view", id: "branches/joi/main" });
    expect(view?.name).toBe("main");
    expect(view?.description).toBe("Joi branch");

    // Branch names containing slashes resolve through the same path form.
    expect(resolveApplicationView(application.registry, { type: "view", id: "branches/joi/feature/login" })?.name).toBe(
      "feature/login",
    );

    // Legacy opaque urls keep resolving.
    expect(resolveApplicationView(application.registry, { type: "view", id: "codevette-branch/branch-1" })?.name).toBe(
      "main",
    );

    // Unknown repositories and branches resolve to nothing.
    expect(resolveApplicationView(application.registry, { type: "view", id: "branches/joi/nope" })).toBeUndefined();
    expect(resolveApplicationView(application.registry, { type: "view", id: "branches/other/main" })).toBeUndefined();
  });

  it("round-trips the branch url through the hash", () => {
    window.location.hash = "#/codevette/branches/joi/main";
    createRoot((dispose) => {
      const navigation = createNavigationController();
      expect(navigation.selection()).toEqual({
        type: "view",
        id: "branches/joi/main",
        route: { source: "system", section: "codevette", id: "branches/joi/main" },
      });
      navigation.selectView("branches/joi/main", {
        source: "system",
        section: "codevette",
        id: "branches/joi/main",
      });
      expect(window.location.hash).toBe("#/codevette/branches/joi/main");
      dispose();
    });
  });
});
