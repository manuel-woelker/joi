import { cleanup, render, screen } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import App from "./App";
import { WORKSPACE_STORAGE_KEY } from "./workspace/repository";

beforeEach(() => {
  localStorage.removeItem(WORKSPACE_STORAGE_KEY);
  window.location.hash = "";
});
afterEach(cleanup);

describe("workspace app", () => {
  it("opens a seeded view and filters it with transient search", async () => {
    render(() => <App />);
    expect(screen.getByRole("heading", { name: "Active issues" })).toBeTruthy();
    await userEvent.type(screen.getByPlaceholderText("Search this view"), "keyboard");
    expect(screen.getByText("Add keyboard navigation to trees")).toBeTruthy();
    expect(screen.queryByText("Preserve view state after reload")).toBeNull();
  });

  it("opens the reusable view editor", async () => {
    render(() => <App />);
    await userEvent.click(screen.getByRole("button", { name: "Configure view" }));
    expect(screen.getByRole("complementary", { name: "Configure view" })).toBeTruthy();
    expect(screen.getByText("Save as private copy")).toBeTruthy();
  });
});
