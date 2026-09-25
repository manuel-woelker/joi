// @vitest-environment happy-dom

import { fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ExtensionInspectorOverlay,
  ExtensionInspectorProvider,
  ExtensionInspectorService,
  InspectableExtension,
  InspectableExtensionPoint,
} from "./extension-inspector";
import { ExtensionInspectorDebugContribution } from "./ExtensionInspectorDebugContribution";

afterEach(() => vi.restoreAllMocks());

describe("ExtensionInspector", () => {
  it("registers and removes visual boundaries with their registration IDs", () => {
    const service = new ExtensionInspectorService();
    const view = render(() => (
      <ExtensionInspectorProvider service={service}>
        <InspectableExtension id="ticket-navigation">
          <button>Tickets</button>
        </InspectableExtension>
      </ExtensionInspectorProvider>
    ));

    expect(service.markers().map(({ id, kind }) => ({ id, kind }))).toEqual([
      { id: "ticket-navigation", kind: "extension" },
    ]);
    view.unmount();
    expect(service.markers()).toEqual([]);
  });

  it("draws distinct extension and extension-point labels only while enabled", async () => {
    const service = new ExtensionInspectorService();
    const rectangle = {
      x: 10,
      y: 20,
      left: 10,
      top: 20,
      right: 110,
      bottom: 60,
      width: 100,
      height: 40,
      toJSON: () => undefined,
    } satisfies DOMRect;
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(rectangle);

    render(() => (
      <ExtensionInspectorProvider service={service}>
        <InspectableExtensionPoint id="navigation-sections">
          <InspectableExtension id="ticket-navigation">
            <button>Tickets</button>
          </InspectableExtension>
        </InspectableExtensionPoint>
        <ExtensionInspectorOverlay />
      </ExtensionInspectorProvider>
    ));

    expect(screen.queryByText("navigation-sections")).toBeNull();
    service.setEnabled(true);
    await waitFor(() => expect(screen.queryByText("navigation-sections")).not.toBeNull());
    const pointLabel = screen.getByText("navigation-sections");
    const extensionLabel = screen.getByText("ticket-navigation");
    expect(pointLabel.parentElement?.parentElement?.className).not.toBe(
      extensionLabel.parentElement?.parentElement?.className,
    );

    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(screen.queryByText("navigation-sections")).toBeNull());
  });

  it("does not measure markers while inspection is disabled", async () => {
    const service = new ExtensionInspectorService();
    const getRectangle = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect");
    render(() => (
      <ExtensionInspectorProvider service={service}>
        <InspectableExtension id="ticket-navigation">
          <button>Tickets</button>
        </InspectableExtension>
        <ExtensionInspectorOverlay />
      </ExtensionInspectorProvider>
    ));

    fireEvent.scroll(window);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(getRectangle).not.toHaveBeenCalled();
  });

  it("toggles inspection from the debug contribution", () => {
    const service = new ExtensionInspectorService();
    render(() => (
      <ExtensionInspectorProvider service={service}>
        <ExtensionInspectorDebugContribution />
      </ExtensionInspectorProvider>
    ));

    fireEvent.click(screen.getByRole("checkbox", { name: "Show extension boundaries" }));
    expect(service.enabled()).toBe(true);
    expect(screen.getByText(/Press Escape to stop/)).not.toBeNull();
  });
});
