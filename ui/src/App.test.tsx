import { cleanup, render, screen } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import App from "./App";
import { WORKSPACE_STORAGE_KEY } from "./workspace/repository";

beforeEach(() => {
  localStorage.removeItem(WORKSPACE_STORAGE_KEY);
  window.location.hash = "";
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        number_of_hits: 3,
        result_columns: [
          { attribute: "id", values: { type: "string", values: ["TICKET-1", "TICKET-2", "TICKET-3"] } },
          {
            attribute: "title",
            values: { type: "string", values: ["Fix navigation bug", "Add issue filters", "Review table schema"] },
          },
          {
            attribute: "description",
            values: { type: "string", values: ["Selection is lost", "Filter by status", "Check columns"] },
          },
          { attribute: "status", values: { type: "string", values: ["open", "in-progress", "closed"] } },
        ],
      }),
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("workspace app", () => {
  it("opens a seeded view and filters it with transient search", async () => {
    render(() => <App />);
    expect(screen.getByRole("heading", { name: "Active issues" })).toBeTruthy();
    expect(screen.getByText("Built with SolidJS")).toBeTruthy();
    expect(await screen.findByText("Fix navigation bug")).toBeTruthy();
    await userEvent.type(screen.getByPlaceholderText("Search this view"), "filters");
    expect(screen.getByText("Add issue filters")).toBeTruthy();
    expect(screen.queryByText("Fix navigation bug")).toBeNull();
  });

  it("opens the reusable view editor", async () => {
    render(() => <App />);
    await userEvent.click(screen.getByRole("button", { name: "Configure view" }));
    expect(screen.getByRole("complementary", { name: "Configure view" })).toBeTruthy();
    expect(screen.getByText("Save as private copy")).toBeTruthy();
  });

  it("opens the Info debug contribution", async () => {
    vi.mocked(fetch).mockImplementation(
      async (input) =>
        ({
          ok: true,
          json: async () =>
            input === "/api/info"
              ? { application_name: "joix-tickets", version: "0.1.0" }
              : input === "/api/plugins"
                ? {
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
                  }
                : {
                    number_of_hits: 0,
                    result_columns: ["id", "title", "description", "status"].map((attribute) => ({
                      attribute,
                      values: { type: "string", values: [] },
                    })),
                  },
        }) as Response,
    );

    render(() => <App />);
    await userEvent.click(screen.getByRole("button", { name: "Open debug tools" }));

    expect(await screen.findByText("joix-tickets")).toBeTruthy();
    const debugNavigation = screen.getByRole("navigation", { name: "Debug contributions" });
    expect(debugNavigation).toBeTruthy();
    expect([...debugNavigation.querySelectorAll("button")].map((button) => button.textContent)).toEqual([
      "Info",
      "UI Extension Points",
      "UI Plugins",
      "Extension Points",
      "Plugins",
    ]);
    expect(screen.getByText("application name")).toBeTruthy();

    await userEvent.click(screen.getByRole("button", { name: "Plugins" }));
    expect(await screen.findByText("infra")).toBeTruthy();
    expect(screen.getByText("info-providers")).toBeTruthy();
    expect(screen.getByText("package-info")).toBeTruthy();

    await userEvent.click(screen.getByRole("button", { name: "Extension Points" }));
    expect(await screen.findByText("info-providers")).toBeTruthy();
    expect(screen.getAllByText("infra")).toHaveLength(2);
    expect(await screen.findByText("package-info")).toBeTruthy();
    expect(screen.getByText("Provides package information")).toBeTruthy();

    await userEvent.click(screen.getByRole("button", { name: "UI Plugins" }));
    expect(await screen.findByText("ui")).toBeTruthy();
    expect(screen.getByText("backend")).toBeTruthy();
    expect(screen.getAllByText("info")).toHaveLength(2);
    expect(screen.getByText("ui-extension-points", { exact: false })).toBeTruthy();

    await userEvent.click(screen.getByRole("button", { name: "UI Extension Points" }));
    expect(await screen.findByText("debug-contributions")).toBeTruthy();
    expect(screen.getByText("Displays UI plugins and their contributions")).toBeTruthy();
  });
});
