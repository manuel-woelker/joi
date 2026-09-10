import { describe, expect, it, vi } from "vitest";

import { DataChangeService } from "./data-change-service";

describe("DataChangeService", () => {
  it("filters changes, preserves listener order, and supports unsubscription during delivery", () => {
    const service = new DataChangeService();
    const calls: string[] = [];
    let unsubscribeSecond: () => void = () => undefined;
    service.subscribe({ tableName: "tickets" }, () => {
      calls.push("first");
      unsubscribeSecond();
    });
    unsubscribeSecond = service.subscribe({ tableName: "tickets", recordId: "ticket-1" }, () => calls.push("second"));

    service.publish({ tableName: "tickets", recordId: "ticket-1", changes: { title: "Changed" } });
    service.publish({ tableName: "users", recordId: "ticket-1", changes: { name: "Ignored" } });

    expect(calls).toEqual(["first", "second"]);
  });

  it("isolates listener failures", () => {
    const service = new DataChangeService();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const listener = vi.fn();
    service.subscribe({ tableName: "tickets" }, () => {
      throw new Error("broken listener");
    });
    service.subscribe({ tableName: "tickets" }, listener);

    service.publish({ tableName: "tickets", recordId: "ticket-1", changes: { title: "Changed" } });

    expect(listener).toHaveBeenCalledOnce();
    expect(consoleError).toHaveBeenCalledOnce();
    consoleError.mockRestore();
  });
});
