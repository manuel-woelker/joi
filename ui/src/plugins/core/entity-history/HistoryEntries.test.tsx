// @vitest-environment happy-dom
import { cleanup, render, screen } from "@solidjs/testing-library";
import { afterEach, expect, it } from "vitest";
import { HistoryEntries } from "./HistoryEntries";

afterEach(cleanup);

it("shares column headers and renders missing values without highlighting either side", async () => {
  const { container } = render(() => (
    <HistoryEntries
      fields={[{ attribute: "description", label: "Description", control: "html" }]}
      entries={[
        {
          id: "create",
          entityId: "ticket",
          userid: "system",
          timestamp: "2026-09-26T12:00:00Z",
          type: "Create",
          changes: [{ key: "description", newValue: "<p>A <strong>new</strong> description</p>" }],
        },
        {
          id: "delete",
          entityId: "ticket",
          userid: "system",
          timestamp: "2026-09-26T12:01:00Z",
          type: "Delete",
          changes: [{ key: "description", oldValue: "<p>A <em>removed</em> description</p>" }],
        },
      ]}
    />
  ));
  expect(await screen.findByText("new")).toBeTruthy();
  expect(screen.getAllByRole("table")).toHaveLength(1);
  expect(screen.getAllByRole("columnheader")).toHaveLength(3);
  expect(container.querySelectorAll('th[scope="rowgroup"][colspan="3"]')).toHaveLength(2);
  expect(screen.getAllByText("-")).toHaveLength(2);
  expect(container.querySelector("mark")).toBeNull();
  expect(container.querySelector("strong")?.textContent).toBe("new");
  expect(container.querySelector("em")?.textContent).toBe("removed");
});

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
  expect(screen.getByText("-")).toBeTruthy();
  expect(screen.getByText("null")).toBeTruthy();
  expect(screen.getByText("Empty")).toBeTruthy();
  expect(container.querySelector("script")).toBeNull();
  expect(container.textContent).toContain("<script>");
});

it("renders rich formatting and highlights changed words without quotes or unsafe markup", async () => {
  const { container } = render(() => (
    <HistoryEntries
      fields={[{ attribute: "description", label: "Description", control: "html" }]}
      entries={[
        {
          id: "history",
          entityId: "ticket",
          userid: "system",
          timestamp: "2026-09-26T12:00:00Z",
          type: "Update",
          changes: [
            { key: "title", oldValue: "Fix old bug", newValue: "Fix new bug" },
            {
              key: "description",
              oldValue: "<p>A <strong>small</strong> issue</p>",
              newValue:
                '<p onclick="alert(1)">A <em>large</em> issue</p><script>alert(1)</script><img src=x onerror="alert(1)">',
            },
          ],
        },
      ]}
    />
  ));
  expect(await screen.findByText("large")).toBeTruthy();
  expect(container.querySelector("strong mark")?.textContent).toBe("small");
  expect(container.querySelector("em mark")?.textContent).toBe("large");
  expect(Array.from(container.querySelectorAll("mark"), (mark) => mark.textContent)).toEqual([
    "old",
    "new",
    "small",
    "large",
  ]);
  expect(container.querySelector("script, img, [onclick], [onerror]")).toBeNull();
  expect(container.textContent).not.toContain("<p>");
  expect(container.textContent).not.toContain('"Fix');
});
