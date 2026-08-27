import { cleanup, render, screen } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import App from "./App";
import { WORKSPACE_STORAGE_KEY } from "./workspace/repository";

beforeEach(() => {
  localStorage.removeItem(WORKSPACE_STORAGE_KEY);
  window.location.hash = "";
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      number_of_hits: 3,
      result_columns: [
        { attribute: "id", values: { type: "string", values: ["TICKET-1", "TICKET-2", "TICKET-3"] } },
        { attribute: "title", values: { type: "string", values: ["Fix navigation bug", "Add issue filters", "Review table schema"] } },
        { attribute: "description", values: { type: "string", values: ["Selection is lost", "Filter by status", "Check columns"] } },
        { attribute: "status", values: { type: "string", values: ["open", "in-progress", "closed"] } },
      ],
    }),
  }));
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
});
