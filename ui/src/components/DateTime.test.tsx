// @vitest-environment happy-dom

import { cleanup, render, screen } from "@solidjs/testing-library";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DateTime, formatAbsoluteDateTime } from "./DateTime";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("DateTime", () => {
  it("shows a human relative time with the absolute local timestamp", () => {
    const date = new Date(Date.now() - 2 * 3_600_000);
    render(() => <DateTime value={date} />);
    const time = screen.getByText("2 hours ago").closest("time")!;
    expect(time.tagName).toBe("TIME");
    expect(time.textContent).toContain(formatAbsoluteDateTime(date));
    expect(time.textContent).toContain(`(${formatAbsoluteDateTime(date)})`);
    expect(time.getAttribute("datetime")).toBe(date.toISOString());
    expect(time.getAttribute("title")).toBe(formatAbsoluteDateTime(date));
  });

  it("formats the absolute timestamp without T separator, offset, or milliseconds", () => {
    const date = new Date(2026, 8, 19, 16, 40, 44, 123);
    const pad = (part: number) => String(part).padStart(2, "0");
    const expected =
      `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
      `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
    expect(formatAbsoluteDateTime(date)).toBe(expected);
    expect(expected).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);

    render(() => <DateTime value={date} />);
    const time = screen.getByTitle(expected);
    expect(time.textContent).not.toContain("T");
    expect(time.textContent).not.toMatch(/[+-]\d{2}:?\d{2}/);
    expect(time.textContent).not.toContain(".123");
  });

  it("accepts Date and number inputs", () => {
    const date = new Date(Date.now() - 60_000);
    const { unmount } = render(() => <DateTime value={date} />);
    expect(screen.getByText("1 minute ago")).toBeTruthy();
    unmount();

    render(() => <DateTime value={date.getTime()} />);
    expect(screen.getByText("1 minute ago")).toBeTruthy();
  });

  it("forwards native time attributes", () => {
    render(() => <DateTime value="2026-09-19T16:40:44Z" aria-label="Commit timestamp" class="custom" />);
    const time = screen.getByLabelText("Commit timestamp");
    expect(time.classList.contains("custom")).toBe(true);
  });

  it("collapses the absolute timestamp while it overflows and restores it when space returns", () => {
    let resizeCallback: ResizeObserverCallback | undefined;
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(callback: ResizeObserverCallback) {
          resizeCallback = callback;
        }
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    const date = new Date(Date.now() - 2 * 3_600_000);
    const absolute = formatAbsoluteDateTime(date);
    render(() => <DateTime value={date} />);
    const time = screen.getByText("2 hours ago").closest("time")!;
    const relative = time.firstElementChild!;
    const parent = time.parentElement!;
    // happy-dom reports zero sizes, so stub the layout instead.
    const stubWidth = (element: Element, property: "clientWidth" | "scrollWidth" | "offsetWidth", get: () => number) =>
      Object.defineProperty(element, property, { configurable: true, get });
    stubWidth(relative, "offsetWidth", () => 90);
    stubWidth(time.querySelectorAll("span")[1]!, "offsetWidth", () => 150);
    const widths = { host: 500, parent: 500 };
    stubWidth(time, "clientWidth", () => widths.host);
    stubWidth(time, "scrollWidth", () => (time.childElementCount > 1 ? 250 : 90));
    stubWidth(parent, "clientWidth", () => widths.parent);

    // Narrow: the absolute part overflows and collapses.
    widths.host = 100;
    widths.parent = 100;
    resizeCallback?.([], {} as ResizeObserver);
    expect(time.textContent).not.toContain(absolute);
    expect(time.textContent).toContain("2 hours ago");

    // Still narrow: it stays collapsed.
    resizeCallback?.([], {} as ResizeObserver);
    expect(time.textContent).not.toContain(absolute);

    // Wide again: the absolute part returns.
    widths.host = 500;
    widths.parent = 500;
    resizeCallback?.([], {} as ResizeObserver);
    expect(time.textContent).toContain(absolute);
  });
});
