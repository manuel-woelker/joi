// @vitest-environment happy-dom

import { cleanup, render, screen } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { createSignal } from "solid-js";
import { afterEach, describe, expect, it } from "vitest";

import { SystemTree } from "./ApplicationNavigation";
import { type NavigationRootContribution, navigationEntryId } from "./contribution";

afterEach(cleanup);

const acme = (): NavigationRootContribution => ({
  id: navigationEntryId("repository-1"),
  type: "folder",
  label: "acme",
  children: [
    {
      id: navigationEntryId("branch-1"),
      type: "leaf",
      label: "main",
      selection: { type: "view", id: "codevette-branch/1" },
    },
  ],
});

const globex = (): NavigationRootContribution => ({
  id: navigationEntryId("repository-2"),
  type: "folder",
  label: "globex",
  children: [
    {
      id: navigationEntryId("branch-2"),
      type: "leaf",
      label: "develop",
      selection: { type: "view", id: "codevette-branch/2" },
    },
  ],
});

describe("SystemTree", () => {
  it("populates the tree when roots load asynchronously after mount", async () => {
    const [roots, setRoots] = createSignal<readonly NavigationRootContribution[]>([]);
    render(() => (
      <SystemTree
        roots={roots()}
        sectionId="codevette"
        onActivate={() => undefined}
        openContextMenu={() => undefined}
      />
    ));

    // Codevette roots start empty while its repository queries are in flight.
    expect(screen.queryByText("acme")).toBeNull();

    // The queries resolve after the section already mounted with no roots.
    setRoots([acme()]);

    expect(await screen.findByText("acme")).toBeTruthy();
    expect(await screen.findByText("main")).toBeTruthy();
  });

  it("leaves folders collapsed once the user toggles them, even when roots grow", async () => {
    const [roots, setRoots] = createSignal<readonly NavigationRootContribution[]>([acme()]);
    render(() => (
      <SystemTree
        roots={roots()}
        sectionId="codevette"
        onActivate={() => undefined}
        openContextMenu={() => undefined}
      />
    ));

    expect(await screen.findByText("main")).toBeTruthy();

    await userEvent.click(screen.getByRole("button", { name: "Close folder" }));
    expect(screen.queryByText("main")).toBeNull();

    // Later root updates no longer force the user's collapsed choice open.
    setRoots((current) => [...current, globex()]);
    expect(await screen.findByText("globex")).toBeTruthy();
    expect(screen.queryByText("develop")).toBeNull();
  });
});
