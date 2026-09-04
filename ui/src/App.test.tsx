import { cleanup, fireEvent, render, screen, waitFor, within } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import App from "./App";
import { REVISION } from "./revision";
import { WORKSPACE_STORAGE_KEY } from "./workspace/repository";

beforeEach(() => {
  localStorage.removeItem(WORKSPACE_STORAGE_KEY);
  window.location.hash = "";
  const createdUsers: Record<string, string>[] = [];
  const createdTickets: Record<string, string>[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation(async (input, init) => {
      if (input === "/api/user-info") {
        return {
          ok: true,
          json: async () => ({ id: "user-1", username: "jane.developer", name: "Jane Developer" }),
        };
      }
      const request = JSON.parse(String(init?.body));
      if (input === "/api/mutate") {
        const insert = request.steps?.[0]?.insert;
        if (insert) {
          const record = Object.fromEntries(
            insert.columns.map((column: { attribute: string; values: { values: string[] } }) => [
              column.attribute,
              column.values.values[0],
            ]),
          );
          (insert.table_name === "users" ? createdUsers : createdTickets).push(record);
        }
        return { ok: true, json: async () => ({}) };
      }
      return {
        ok: true,
        json: async () =>
          request.table_name === "users"
            ? {
                number_of_hits: 2 + createdUsers.length,
                result_columns: [
                  {
                    attribute: "id",
                    values: { type: "string", values: ["user-1", "user-2", ...createdUsers.map((user) => user.id)] },
                  },
                  {
                    attribute: "username",
                    values: {
                      type: "string",
                      values: ["jane.developer", "joe.tester", ...createdUsers.map((user) => user.username)],
                    },
                  },
                  {
                    attribute: "name",
                    values: {
                      type: "string",
                      values: ["Jane Developer", "Joe Tester", ...createdUsers.map((user) => user.name)],
                    },
                  },
                ],
              }
            : {
                number_of_hits: 3 + createdTickets.length,
                result_columns: [
                  {
                    attribute: "id",
                    values: {
                      type: "string",
                      values: [
                        "0o5Fs0EELR0fUjHjbCnEtdUwQe3",
                        "0o5Fs0EELR0fUjHjbCnEtdUwQe4",
                        "0o5Fs0EELR0fUjHjbCnEtdUwQe5",
                        ...createdTickets.map((ticket) => ticket.id),
                      ],
                    },
                  },
                  {
                    attribute: "key",
                    values: {
                      type: "string",
                      values: ["TEST-1", "TEST-2", "TEST-3", ...createdTickets.map((ticket) => ticket.key)],
                    },
                  },
                  {
                    attribute: "title",
                    values: {
                      type: "string",
                      values: [
                        "Fix navigation bug",
                        "Add issue filters",
                        "Review table schema",
                        ...createdTickets.map((ticket) => ticket.title),
                      ],
                    },
                  },
                  {
                    attribute: "description",
                    values: {
                      type: "string",
                      values: [
                        "Selection is lost",
                        "Filter by status",
                        "Check columns",
                        ...createdTickets.map((ticket) => ticket.description),
                      ],
                    },
                  },
                  {
                    attribute: "status",
                    values: {
                      type: "string",
                      values: ["open", "in-progress", "closed", ...createdTickets.map((ticket) => ticket.status)],
                    },
                  },
                  {
                    attribute: "assignee",
                    values: {
                      type: "string",
                      values: ["user-1", "user-2", "user-1", ...createdTickets.map((ticket) => ticket.assignee)],
                    },
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
  it("logs out from the user menu and returns to login", async () => {
    let authenticated = true;
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      if (input === "/api/user-info") {
        return authenticated
          ? ({
              ok: true,
              json: async () => ({ id: "user-1", username: "jane.developer", name: "Jane Developer" }),
            } as Response)
          : ({ ok: false, status: 401, json: async () => ({ error: "login required" }) } as Response);
      }
      if (input === "/api/logout") {
        authenticated = false;
        return { ok: true, json: async () => ({}) } as Response;
      }
      const request = JSON.parse(String(init?.body));
      return {
        ok: true,
        json: async () =>
          request.table_name === "users"
            ? {
                number_of_hits: 1,
                result_columns: [
                  { attribute: "id", values: { type: "string", values: ["user-1"] } },
                  { attribute: "username", values: { type: "string", values: ["jane.developer"] } },
                  { attribute: "name", values: { type: "string", values: ["Jane Developer"] } },
                ],
              }
            : {
                number_of_hits: 0,
                result_columns: ["id", "key", "title", "description", "status", "assignee"].map((attribute) => ({
                  attribute,
                  values: { type: "string", values: [] },
                })),
              },
      } as Response;
    });

    render(() => <App />);
    await userEvent.click(await screen.findByRole("button", { name: "Jane Developer" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Logout" }));

    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeTruthy();
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      "/api/logout",
      expect.objectContaining({
        method: "POST",
        body: "{}",
      }),
    );
  });

  it("prompts for a user when no session exists, then retries user info", async () => {
    let authenticated = false;
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      if (input === "/api/user-info") {
        return authenticated
          ? ({ ok: true, json: async () => ({ id: "user-2", username: "joe.tester", name: "Joe Tester" }) } as Response)
          : ({ ok: false, status: 401, json: async () => ({ error: "login required" }) } as Response);
      }
      if (input === "/api/login") {
        authenticated = true;
        return {
          ok: true,
          json: async () => ({ user: { id: "user-2", username: "joe.tester", name: "Joe Tester" } }),
        } as Response;
      }
      const request = JSON.parse(String(init?.body));
      return {
        ok: true,
        json: async () =>
          request.table_name === "users"
            ? {
                number_of_hits: 2,
                result_columns: [
                  { attribute: "id", values: { type: "string", values: ["user-1", "user-2"] } },
                  { attribute: "username", values: { type: "string", values: ["jane.developer", "joe.tester"] } },
                  { attribute: "name", values: { type: "string", values: ["Jane Developer", "Joe Tester"] } },
                ],
              }
            : {
                number_of_hits: 0,
                result_columns: ["id", "key", "title", "description", "status", "assignee"].map((attribute) => ({
                  attribute,
                  values: { type: "string", values: [] },
                })),
              },
      } as Response;
    });

    render(() => <App />);
    const selector = await screen.findByRole("combobox", { name: "User" });
    await userEvent.selectOptions(selector, "user-2");
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect(await screen.findByText("Joe Tester")).toBeTruthy();
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      "/api/login",
      expect.objectContaining({
        body: JSON.stringify({ user_id: "user-2" }),
      }),
    );
    expect(vi.mocked(fetch).mock.calls.filter(([input]) => input === "/api/user-info")).toHaveLength(2);
  });

  it("opens a seeded view and filters it with transient search", async () => {
    render(() => <App />);
    const heading = await screen.findByRole("heading", { name: "Active issues" });
    expect(heading.parentElement?.querySelector(".lucide-ticket")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Active issues" }).querySelector(".lucide-ticket")).toBeTruthy();
    expect(screen.getByRole("tree", { name: "Saved views" }).querySelector(".lucide-folder")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Playground" }).getAttribute("href")).toBe("#playground");
    expect(screen.queryByRole("button", { name: /Open playground/ })).toBeNull();
    expect(screen.getByText(REVISION)).toBeTruthy();
    expect(await screen.findByText("Fix navigation bug")).toBeTruthy();
    expect(await screen.findByText("Joe Tester")).toBeTruthy();
    await userEvent.type(screen.getByPlaceholderText("Search this view"), "filters");
    expect(screen.getByText("Add issue filters")).toBeTruthy();
    expect(screen.queryByText("Fix navigation bug")).toBeNull();
  });

  it("opens the action launcher and navigates to the playground action", async () => {
    render(() => <App />);
    const workspaceSearch = await screen.findByPlaceholderText("Search this view");
    workspaceSearch.focus();
    fireEvent.keyDown(workspaceSearch, { key: "A", ctrlKey: true, shiftKey: true });

    const launcherSearch = screen.getByRole("combobox", { name: "Filter actions" });
    await userEvent.type(launcherSearch, "playground");
    fireEvent.keyDown(launcherSearch, { key: "Enter" });

    expect(window.location.hash).toBe("#playground");
  });

  it("opens and autosaves a ticket", async () => {
    render(() => <App />);
    await userEvent.dblClick(await screen.findByText("Fix navigation bug"));

    expect(window.location.hash).toBe("#/views/view-active/records/0o5Fs0EELR0fUjHjbCnEtdUwQe3");
    expect(screen.getByRole("heading", { name: "Active issues" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Ticket details" })).toBeTruthy();
    expect(screen.getByRole("table", { name: "Active issues" })).toBeTruthy();
    const title = await screen.findByRole("textbox", { name: "Title" });
    const description = screen.getByRole("textbox", { name: "Description" });
    const assignee = await screen.findByRole("combobox", { name: "Assignee" });
    await waitFor(() => expect((assignee as HTMLInputElement).value).toBe("Jane Developer"));
    await userEvent.click(assignee);
    await userEvent.click(await screen.findByRole("option", { name: "Joe Tester" }));
    await waitFor(() =>
      expect(vi.mocked(fetch)).toHaveBeenCalledWith(
        "/api/mutate",
        expect.objectContaining({
          body: JSON.stringify({
            steps: [
              {
                update: {
                  table_name: "tickets",
                  ids: ["0o5Fs0EELR0fUjHjbCnEtdUwQe3"],
                  columns: [{ attribute: "assignee", values: { type: "string", values: ["user-2"] } }],
                },
              },
            ],
          }),
        }),
      ),
    );
    const queryCallsBeforeSave = vi.mocked(fetch).mock.calls.filter(([input]) => input === "/api/query").length;
    await userEvent.clear(title);
    await userEvent.type(title, "Fix persistent navigation bug");
    await userEvent.clear(description);
    await userEvent.type(description, "Keep the selected view after navigation.");
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
    await screen.findByText("Saved");
    expect(screen.getByText("Fix persistent navigation bug")).toBeTruthy();
    expect(vi.mocked(fetch).mock.calls.filter(([input]) => input === "/api/query")).toHaveLength(queryCallsBeforeSave);
    expect(document.activeElement).toBe(description);
    await userEvent.click(screen.getByRole("button", { name: "Close details" }));
    expect(window.location.hash).toBe("#/views/view-active");
    expect(screen.queryByRole("heading", { name: "Ticket details" })).toBeNull();
  });

  it("shows a newly selected ticket in an already open detail pane", async () => {
    render(() => <App />);
    await userEvent.dblClick(await screen.findByText("Fix navigation bug"));
    expect(((await screen.findByRole("textbox", { name: "Title" })) as HTMLInputElement).value).toBe(
      "Fix navigation bug",
    );

    await userEvent.click(screen.getByRole("row", { name: /TEST-2 Add issue filters/ }));

    expect(window.location.hash).toBe("#/views/view-active/records/0o5Fs0EELR0fUjHjbCnEtdUwQe4");
    expect((screen.getByRole("textbox", { name: "Title" }) as HTMLInputElement).value).toBe("Add issue filters");
  });

  it("assigns a selected ticket without opening its editor or refetching", async () => {
    render(() => <App />);
    const row = await screen.findByRole("row", { name: /TEST-2 Add issue filters/ });
    await userEvent.click(row);

    expect(window.location.hash).toBe("");
    expect(screen.queryByRole("heading", { name: "Ticket details" })).toBeNull();
    expect(screen.getByRole("button", { name: /Assign to me/ })).toBeTruthy();
    const queryCalls = vi.mocked(fetch).mock.calls.filter(([input]) => input === "/api/query").length;
    const search = screen.getByPlaceholderText("Search this view");
    search.focus();
    fireEvent.keyDown(search, { key: "i" });
    expect(vi.mocked(fetch).mock.calls.filter(([input]) => input === "/api/mutate")).toHaveLength(0);
    search.blur();
    fireEvent.keyDown(document, { key: "i" });

    await waitFor(() =>
      expect(vi.mocked(fetch)).toHaveBeenCalledWith(
        "/api/mutate",
        expect.objectContaining({
          body: JSON.stringify({
            steps: [
              {
                update: {
                  table_name: "tickets",
                  ids: ["0o5Fs0EELR0fUjHjbCnEtdUwQe4"],
                  columns: [{ attribute: "assignee", values: { type: "string", values: ["user-1"] } }],
                },
              },
            ],
          }),
        }),
      ),
    );
    expect(await within(row).findByText("Jane Developer")).toBeTruthy();
    expect(window.location.hash).toBe("");
    expect(vi.mocked(fetch).mock.calls.filter(([input]) => input === "/api/query")).toHaveLength(queryCalls);
  });

  it("unassigns a selected ticket with the u hotkey", async () => {
    render(() => <App />);
    const row = await screen.findByRole("row", { name: /TEST-1 Fix navigation bug/ });
    await userEvent.click(row);
    const queryCalls = vi.mocked(fetch).mock.calls.filter(([input]) => input === "/api/query").length;

    expect(screen.getByRole("button", { name: /Unassign/ })).toBeTruthy();
    fireEvent.keyDown(document, { key: "u" });

    await waitFor(() =>
      expect(vi.mocked(fetch)).toHaveBeenCalledWith(
        "/api/mutate",
        expect.objectContaining({
          body: JSON.stringify({
            steps: [
              {
                update: {
                  table_name: "tickets",
                  ids: ["0o5Fs0EELR0fUjHjbCnEtdUwQe3"],
                  columns: [{ attribute: "assignee", values: { type: "nullable_string", values: [null] } }],
                },
              },
            ],
          }),
        }),
      ),
    );
    expect(await within(row).findByText("Unassigned")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Unassign/ })).toBeNull();
    expect(window.location.hash).toBe("");
    expect(vi.mocked(fetch).mock.calls.filter(([input]) => input === "/api/query")).toHaveLength(queryCalls);
  });

  it("runs ticket actions from the row context menu", async () => {
    render(() => <App />);
    const row = await screen.findByRole("row", { name: /TEST-2 Add issue filters/ });
    fireEvent.contextMenu(row, { clientX: 100, clientY: 120 });

    expect(row.getAttribute("aria-selected")).toBe("true");
    expect(window.location.hash).toBe("");
    expect(screen.queryByRole("heading", { name: "Ticket details" })).toBeNull();
    await userEvent.click(screen.getByRole("menuitem", { name: /Assign to me/ }));

    await waitFor(() =>
      expect(vi.mocked(fetch)).toHaveBeenCalledWith(
        "/api/mutate",
        expect.objectContaining({
          body: JSON.stringify({
            steps: [
              {
                update: {
                  table_name: "tickets",
                  ids: ["0o5Fs0EELR0fUjHjbCnEtdUwQe4"],
                  columns: [{ attribute: "assignee", values: { type: "string", values: ["user-1"] } }],
                },
              },
            ],
          }),
        }),
      ),
    );
    expect(await within(row).findByText("Jane Developer")).toBeTruthy();

    fireEvent.contextMenu(row, { clientX: 100, clientY: 120 });
    await userEvent.click(screen.getByRole("menuitem", { name: /Unassign/ }));
    await waitFor(() =>
      expect(vi.mocked(fetch)).toHaveBeenCalledWith(
        "/api/mutate",
        expect.objectContaining({
          body: JSON.stringify({
            steps: [
              {
                update: {
                  table_name: "tickets",
                  ids: ["0o5Fs0EELR0fUjHjbCnEtdUwQe4"],
                  columns: [{ attribute: "assignee", values: { type: "nullable_string", values: [null] } }],
                },
              },
            ],
          }),
        }),
      ),
    );
    expect(await within(row).findByText("Unassigned")).toBeTruthy();
  });

  it("restores a selected record from the URL", async () => {
    window.location.hash = "/administration/users/records/user-2";
    render(() => <App />);

    expect(await screen.findByRole("heading", { name: "User details" })).toBeTruthy();
    expect((screen.getByRole("textbox", { name: "Username" }) as HTMLInputElement).value).toBe("joe.tester");
    expect(screen.getByRole("button", { name: "Users" }).className).toMatch(/contributionSelected/);
  });

  it("opens the reusable view editor", async () => {
    render(() => <App />);
    await userEvent.click(await screen.findByRole("button", { name: "Configure view" }));
    expect(screen.getByRole("complementary", { name: "Configure view" })).toBeTruthy();
    expect(screen.getByText("Save as private copy")).toBeTruthy();
  });

  it("navigates administration entries through the URL", async () => {
    render(() => <App />);

    await userEvent.click(await screen.findByRole("button", { name: "Commands for Work" }));
    expect(screen.getByRole("menuitem", { name: "New view" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "Rename" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "Root" })).toBeTruthy();
    fireEvent.keyDown(screen.getByRole("menuitem", { name: "Rename" }), { key: "Escape" });
    await userEvent.click(screen.getByRole("button", { name: "Work" }));
    await userEvent.click(screen.getByRole("button", { name: "Commands for Active issues" }));
    expect(screen.getByRole("menuitem", { name: "Duplicate" })).toBeTruthy();
    fireEvent.keyDown(screen.getByRole("menuitem", { name: "Duplicate" }), { key: "Escape" });
    await userEvent.click(screen.getByRole("button", { name: "Work" }));

    await userEvent.click(await screen.findByRole("button", { name: "Users" }));
    expect(window.location.hash).toBe("#/administration/users");
    expect(screen.getByRole("heading", { name: "Users" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Users" }).parentElement?.querySelector(".lucide-users")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Active issues" }).parentElement?.className).not.toMatch(
      /treeRowSelected/,
    );
    for (const folder of screen.getAllByRole("treeitem").filter((item) => item.hasAttribute("aria-expanded"))) {
      expect(folder.firstElementChild?.className).not.toMatch(/treeRowSelected|contributionSelected/);
    }
    expect(await screen.findByRole("columnheader", { name: "Username" })).toBeTruthy();
    expect(screen.getAllByText("Jane Developer")).toHaveLength(2);
    expect(screen.queryByRole("columnheader", { name: "ID" })).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "Active issues" }));
    expect(window.location.hash).toBe("#/views/view-active");
    expect(screen.getByRole("heading", { name: "Active issues" })).toBeTruthy();
    expect(await screen.findByRole("columnheader", { name: "Issue" })).toBeTruthy();
    expect(screen.queryByRole("columnheader", { name: "Username" })).toBeNull();

    window.location.hash = "/administration/users";
    window.dispatchEvent(new HashChangeEvent("hashchange"));
    await waitFor(() => expect(screen.getByRole("heading", { name: "Users" })).toBeTruthy());
    expect(screen.getByRole("button", { name: "Active issues" }).parentElement?.className).not.toMatch(
      /treeRowSelected/,
    );
  });

  it("opens and autosaves a user beside the users table", async () => {
    render(() => <App />);
    await userEvent.click(await screen.findByRole("button", { name: "Users" }));
    await userEvent.click(await screen.findByRole("row", { name: "jane.developer Jane Developer" }));

    expect(window.location.hash).toBe("#/administration/users/records/user-1");
    expect(screen.getByRole("table", { name: "Users" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "User details" })).toBeTruthy();
    const name = screen.getByRole("textbox", { name: "Name" });
    await userEvent.clear(name);
    await userEvent.type(name, "Jane Engineer");
    await waitFor(() =>
      expect(vi.mocked(fetch)).toHaveBeenCalledWith(
        "/api/mutate",
        expect.objectContaining({
          body: expect.stringContaining('"table_name":"users"'),
        }),
      ),
    );
    expect(await screen.findByText("Jane Engineer")).toBeTruthy();
    expect(screen.queryByRole("columnheader", { name: "ID" })).toBeNull();
  });

  it("creates a user only through explicit submission", async () => {
    render(() => <App />);
    await userEvent.click(await screen.findByRole("button", { name: "Users" }));
    await screen.findByRole("table", { name: "Users" });
    await userEvent.click(screen.getByRole("button", { name: "New user" }));

    expect(window.location.hash).toBe("#/administration/users/new");
    expect(screen.getByRole("heading", { name: "New User" })).toBeTruthy();
    expect(screen.queryByRole("textbox", { name: "ID" })).toBeNull();
    await userEvent.type(screen.getByRole("textbox", { name: "Username" }), "alex.builder");
    await userEvent.type(screen.getByRole("textbox", { name: "Name" }), "Alex Builder");
    expect(vi.mocked(fetch).mock.calls.filter(([input]) => input === "/api/mutate")).toHaveLength(0);
    await userEvent.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => expect(window.location.hash).toMatch(/^#\/administration\/users\/records\/[0-9A-Za-z]{27}$/));
    expect(await screen.findByText("Alex Builder")).toBeTruthy();
  });

  it("creates an open ticket with an explicit key", async () => {
    render(() => <App />);
    await screen.findByRole("table", { name: "Active issues" });
    await userEvent.click(screen.getByRole("button", { name: "New ticket" }));
    await userEvent.type(screen.getByRole("textbox", { name: "Key" }), "TEST-4");
    await userEvent.type(screen.getByRole("textbox", { name: "Title" }), "Create ticket workflow");
    await userEvent.type(screen.getByRole("textbox", { name: "Description" }), "Exercise explicit creation.");
    await userEvent.click(screen.getByRole("combobox", { name: "Assignee" }));
    await userEvent.click(await screen.findByRole("option", { name: "Jane Developer" }));
    await userEvent.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => expect(window.location.hash).toMatch(/^#\/views\/view-active\/records\/[0-9A-Za-z]{27}$/));
    expect(await screen.findByText("Create ticket workflow")).toBeTruthy();
    const insertCall = vi
      .mocked(fetch)
      .mock.calls.find(([input, init]) => input === "/api/mutate" && String(init?.body).includes('"insert"'));
    expect(String(insertCall?.[1]?.body)).toContain('"status","values":{"type":"string","values":["open"]}');
  });

  it("opens the Info debug contribution", async () => {
    vi.mocked(fetch).mockImplementation(
      async (input) =>
        ({
          ok: true,
          json: async () =>
            input === "/api/user-info"
              ? { id: "user-1", username: "jane.developer", name: "Jane Developer" }
              : input === "/api/info"
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
                      result_columns: ["id", "key", "title", "description", "status", "assignee"].map((attribute) => ({
                        attribute,
                        values: { type: "string", values: [] },
                      })),
                    },
        }) as Response,
    );

    render(() => <App />);
    await userEvent.click(await screen.findByRole("button", { name: "Open debug tools" }));

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
