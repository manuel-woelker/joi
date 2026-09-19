// @vitest-environment happy-dom

import { cleanup, render, screen } from "@solidjs/testing-library";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import { clearTablePerformance, recordTablePerformance } from "../../master-detail/table-performance";
import { TablePerformanceDebugContribution } from "./TablePerformanceDebugContribution";

afterEach(() => {
  cleanup();
  clearTablePerformance();
});

const ticketMetrics = {
  entityId: "ticket",
  entityLabel: "Tickets",
  tableName: "tickets",
  fetchMs: 12.345,
  processMs: 1.234,
  displayMs: 5.678,
  rowCount: 25,
  totalCount: 100,
  columnCount: 6,
  measuredAt: new Date("2026-09-19T10:00:00").getTime(),
};

describe("TablePerformanceDebugContribution", () => {
  it("invites opening an entity table when nothing was measured", () => {
    render(() => <TablePerformanceDebugContribution />);
    expect(screen.getByText(/Nothing measured yet/)).toBeDefined();
  });

  it("lists fetch, process, and display metrics per entity", async () => {
    recordTablePerformance(ticketMetrics);
    render(() => <TablePerformanceDebugContribution />);

    expect(await screen.findByText("Tickets")).toBeDefined();
    for (const label of ["Fetch", "Process", "Display", "Rows", "Columns", "Measured"]) {
      expect(screen.getByText(label)).toBeDefined();
    }
    expect(screen.getByText("25 of 100")).toBeDefined();

    await userEvent.click(screen.getByRole("button", { name: "Clear metrics" }));
    expect(await screen.findByText(/Nothing measured yet/)).toBeDefined();
  });
});
