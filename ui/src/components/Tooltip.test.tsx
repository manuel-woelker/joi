// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen } from "@solidjs/testing-library";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Tooltip } from "./Tooltip";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("Tooltip", () => {
  it("creates content only after the delay and removes it on leave", () => {
    vi.useFakeTimers();
    const content = vi.fn(() => "More information");
    render(() => (
      <Tooltip content={content} delay={300}>
        <button type="button">Target</button>
      </Tooltip>
    ));
    const target = screen.getByRole("button", { name: "Target" });
    expect(content).not.toHaveBeenCalled();
    fireEvent.mouseEnter(target.parentElement!);
    vi.advanceTimersByTime(299);
    expect(content).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(screen.getByRole("tooltip").textContent).toBe("More information");
    expect(content).toHaveBeenCalledTimes(1);
    fireEvent.mouseLeave(target.parentElement!);
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("cancels pending content when the pointer leaves", () => {
    vi.useFakeTimers();
    const content = vi.fn(() => "Hidden");
    render(() => (
      <Tooltip content={content}>
        <button type="button">Target</button>
      </Tooltip>
    ));
    const anchor = screen.getByRole("button", { name: "Target" }).parentElement!;
    fireEvent.mouseEnter(anchor);
    fireEvent.mouseLeave(anchor);
    vi.advanceTimersByTime(500);
    expect(content).not.toHaveBeenCalled();
  });

  it("opens on focus and closes on blur", () => {
    vi.useFakeTimers();
    render(() => (
      <Tooltip delay={0} content={() => "Keyboard help"}>
        <button type="button">Target</button>
      </Tooltip>
    ));
    const target = screen.getByRole("button", { name: "Target" });
    fireEvent.focusIn(target);
    vi.runAllTimers();
    expect(screen.getByRole("tooltip").textContent).toBe("Keyboard help");
    fireEvent.focusOut(target);
    expect(screen.queryByRole("tooltip")).toBeNull();
  });
});
