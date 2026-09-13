// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { afterEach, describe, expect, it, vi } from "vitest";

const applicationState = vi.hoisted(() => ({ error: undefined as Error | undefined }));

vi.mock("./App", () => ({
  default: () => {
    if (applicationState.error) throw applicationState.error;
    return <main>Workspace application</main>;
  },
}));

import { Root } from "./Root";

afterEach(() => {
  applicationState.error = undefined;
  cleanup();
});

describe("Root", () => {
  it("switches between playground and workspace hashes", () => {
    window.location.hash = "#playground";
    render(() => <Root />);
    expect(screen.getByText("Component playground")).toBeTruthy();

    window.location.hash = "#/views/view-active";
    window.dispatchEvent(new HashChangeEvent("hashchange"));
    expect(screen.getByText("Workspace application")).toBeTruthy();
    expect(screen.queryByText("Component playground")).toBeNull();
  });

  it("shows application startup errors, copies diagnostics, and allows retrying", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    window.location.hash = "#/views/view-active";
    applicationState.error = new Error("Plugin initialization failed");
    render(() => <Root />);

    expect(screen.getByRole("alert").textContent).toContain("Plugin initialization failed");
    const stackTrace = screen.getByText("Stack trace").closest<HTMLDetailsElement>("details")!;
    expect(stackTrace.open).toBe(false);
    fireEvent.click(screen.getByText("Stack trace"));
    expect(stackTrace.open).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Copy details" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledOnce());
    expect(writeText.mock.calls[0][0]).toContain("Error: Plugin initialization failed");
    expect(writeText.mock.calls[0][0]).toContain("Application revision: test");
    expect(writeText.mock.calls[0][0]).toContain("User agent:");
    expect(writeText.mock.calls[0][0]).toContain("DPI scaling:");
    expect(screen.getByText("Copied")).toBeTruthy();
    applicationState.error = undefined;
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(screen.getByText("Workspace application")).toBeTruthy();
  });
});
