// @vitest-environment happy-dom
import { cleanup, render, screen } from "@solidjs/testing-library";
import { afterEach, expect, it } from "vitest";
import { HistoryEntries } from "./HistoryEntries";

afterEach(cleanup);
it("distinguishes absence, null, empty and escaped HTML without requiring lookups", async () => {
  const { container } = render(() => (
    <HistoryEntries
      fields={[]}
      entries={[
        {
          id: "history",
          entityId: "ticket",
          userid: "system",
          timestamp: "2026-09-26T12:00:00Z",
          type: "Update",
          changes: [
            { key: "assignee", oldValue: undefined, newValue: null },
            { key: "description", oldValue: "", newValue: "<script>alert('unsafe')</script>" },
          ],
        },
      ]}
    />
  ));
  expect(await screen.findByText("System")).toBeTruthy();
  expect(screen.getByText("Not present")).toBeTruthy();
  expect(screen.getByText("null")).toBeTruthy();
  expect(screen.getByText('""')).toBeTruthy();
  expect(container.querySelector("script")).toBeNull();
  expect(container.textContent).toContain("<script>");
});
