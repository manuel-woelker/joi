// @vitest-environment happy-dom

import { cleanup, render, screen } from "@solidjs/testing-library";
import { afterEach, expect, it, vi } from "vitest";
import { ViewContent } from "./ViewContent";

vi.mock("../plugins/core/actions/ActionCommands", () => ({ ActionCommands: () => null }));

afterEach(cleanup);

it("omits the shared heading when the view owns its page heading", () => {
  render(() => (
    <ViewContent
      view={{
        id: "entity:x",
        name: "Entity",
        section: "Record",
        hideHeading: true,
        content: () => <h2>Actual title</h2>,
      }}
    />
  ));
  expect(screen.getByRole("heading", { name: "Actual title" })).toBeTruthy();
  expect(screen.queryByText("Record")).toBeNull();
  expect(screen.queryByRole("heading", { name: "Entity" })).toBeNull();
});

it("keeps headings for ordinary views", () => {
  render(() => (
    <ViewContent view={{ id: "tickets", name: "Tickets", section: "Work", content: () => <div>List</div> }} />
  ));
  expect(screen.getByRole("heading", { name: "Tickets" })).toBeTruthy();
  expect(screen.getByText("Work")).toBeTruthy();
});
