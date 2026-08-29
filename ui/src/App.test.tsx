import { cleanup, render, screen, waitFor } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import App from "./App";
import { REVISION } from "./revision";
import { WORKSPACE_STORAGE_KEY } from "./workspace/repository";

beforeEach(() => {
  localStorage.removeItem(WORKSPACE_STORAGE_KEY);
  window.location.hash = "";
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation(async (_input, init) => {
      const request = JSON.parse(String(init?.body));
      return {
        ok: true,
        json: async () =>
          request.table_name === "users"
            ? {
                number_of_hits: 2,
                result_columns: [
                  { attribute: "id", values: { type: "string", values: ["user-1", "user-2"] } },
                  {
                    attribute: "username",
                    values: { type: "string", values: ["jane.developer", "joe.tester"] },
                  },
                  { attribute: "name", values: { type: "string", values: ["Jane Developer", "Joe Tester"] } },
                ],
              }
            : {
                number_of_hits: 3,
                result_columns: [
                  {
                    attribute: "id",
                    values: {
                      type: "string",
                      values: [
                        "0o5Fs0EELR0fUjHjbCnEtdUwQe3",
                        "0o5Fs0EELR0fUjHjbCnEtdUwQe4",
                        "0o5Fs0EELR0fUjHjbCnEtdUwQe5",
                      ],
                    },
                  },
                  { attribute: "key", values: { type: "string", values: ["TEST-1", "TEST-2", "TEST-3"] } },
                  {
                    attribute: "title",
                    values: {
                      type: "string",
                      values: ["Fix navigation bug", "Add issue filters", "Review table schema"],
                    },
                  },
                  {
                    attribute: "description",
                    values: { type: "string", values: ["Selection is lost", "Filter by status", "Check columns"] },
                  },
                  {
                    attribute: "status",
                    values: { type: "string", values: ["open", "in-progress", "closed"] },
                  },
                ],
              },
      };
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
    expect(screen.getByText(REVISION)).toBeTruthy();
    expect(await screen.findByText("Fix navigation bug")).toBeTruthy();
    await userEvent.type(screen.getByPlaceholderText("Search this view"), "filters");
    expect(screen.getByText("Add issue filters")).toBeTruthy();
    expect(screen.queryByText("Fix navigation bug")).toBeNull();
  });

  it("opens and edits a ticket", async () => {
    render(() => <App />);
    await userEvent.click(await screen.findByText("Fix navigation bug"));

    expect(window.location.hash).toBe("#/tickets/0o5Fs0EELR0fUjHjbCnEtdUwQe3");
    expect(screen.getByRole("heading", { name: "Ticket" })).toBeTruthy();
    const title = await screen.findByRole("textbox", { name: "Title" });
    const description = screen.getByRole("textbox", { name: "Description" });
    await userEvent.clear(title);
    await userEvent.type(title, "Fix persistent navigation bug");
    await userEvent.clear(description);
    await userEvent.type(description, "Keep the selected view after navigation.");
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() =>
      expect(vi.mocked(fetch)).toHaveBeenCalledWith(
        "/api/mutate",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            steps: [
              {
                update: {
                  table_name: "tickets",
                  ids: ["0o5Fs0EELR0fUjHjbCnEtdUwQe3"],
                  columns: [
                    {
                      attribute: "title",
                      values: { type: "string", values: ["Fix persistent navigation bug"] },
                    },
                    {
                      attribute: "description",
                      values: { type: "string", values: ["Keep the selected view after navigation."] },
                    },
                  ],
                },
              },
            ],
          }),
        }),
      ),
    );
  });

  it("opens the reusable view editor", async () => {
    render(() => <App />);
    await userEvent.click(screen.getByRole("button", { name: "Configure view" }));
    expect(screen.getByRole("complementary", { name: "Configure view" })).toBeTruthy();
    expect(screen.getByText("Save as private copy")).toBeTruthy();
  });

  it("navigates administration entries through the URL", async () => {
    render(() => <App />);

    await userEvent.click(screen.getByRole("button", { name: "Users" }));
    expect(window.location.hash).toBe("#/administration/users");
    expect(screen.getByRole("heading", { name: "Users" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Active issues" }).parentElement?.className).not.toMatch(/selected/);
    expect(await screen.findByRole("columnheader", { name: "Username" })).toBeTruthy();
    expect(screen.getByText("Jane Developer")).toBeTruthy();
    expect(screen.queryByRole("columnheader", { name: "ID" })).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "Active issues" }));
    expect(window.location.hash).toBe("#/views/view-active");
    expect(screen.getByRole("heading", { name: "Active issues" })).toBeTruthy();
    expect(await screen.findByRole("columnheader", { name: "Issue" })).toBeTruthy();
    expect(screen.queryByRole("columnheader", { name: "Username" })).toBeNull();

    window.location.hash = "/administration/users";
    window.dispatchEvent(new HashChangeEvent("hashchange"));
    await waitFor(() => expect(screen.getByRole("heading", { name: "Users" })).toBeTruthy());
    expect(screen.getByRole("button", { name: "Active issues" }).parentElement?.className).not.toMatch(/selected/);
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
                    result_columns: ["id", "key", "title", "description", "status"].map((attribute) => ({
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
