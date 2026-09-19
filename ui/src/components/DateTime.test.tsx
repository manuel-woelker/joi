// @vitest-environment happy-dom

import { cleanup, render, screen } from "@solidjs/testing-library";
import { afterEach, describe, expect, it } from "vitest";

import { DateTime } from "./DateTime";

afterEach(cleanup);

describe("DateTime", () => {
  it("renders ISO8601 with the local timezone offset", () => {
    render(() => <DateTime value="2026-09-19T16:40:44Z" />);
    const time = screen.getByText((text) => text.includes("T16:40:44"));
    expect(time.tagName).toBe("TIME");
    expect(time.getAttribute("datetime")).toBe("2026-09-19T16:40:44.000Z");
    expect(time.getAttribute("title")).toBe(time.textContent);
    // Local offset must be present instead of the UTC Z marker.
    expect(time.textContent).not.toMatch(/Z$/);
    expect(time.textContent).toMatch(/[+-]\d{2}:\d{2}$/);
  });

  it("accepts Date and number inputs", () => {
    const date = new Date("2026-09-19T16:40:44Z");
    const { unmount } = render(() => <DateTime value={date} />);
    expect(screen.getByText((text) => text.includes("T16:40:44"))).toBeTruthy();
    unmount();

    render(() => <DateTime value={date.getTime()} />);
    expect(screen.getByText((text) => text.includes("T16:40:44"))).toBeTruthy();
  });

  it("forwards native time attributes", () => {
    render(() => <DateTime value="2026-09-19T16:40:44Z" aria-label="Commit timestamp" class="custom" />);
    const time = screen.getByLabelText("Commit timestamp");
    expect(time.classList.contains("custom")).toBe(true);
  });
});