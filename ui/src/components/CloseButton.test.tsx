// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@solidjs/testing-library";
import { afterEach, expect, it, vi } from "vitest";
import { CloseButton } from "./CloseButton";

afterEach(cleanup);

it("provides a labeled, non-submit close button with a tooltip", () => {
  const close = vi.fn();
  render(() => <CloseButton label="Close details" onClick={close} />);
  const button = screen.getByRole("button", { name: "Close details" });
  expect(button.getAttribute("type")).toBe("button");
  expect(button.getAttribute("data-tooltip")).toBe("Close details");
  fireEvent.click(button);
  expect(close).toHaveBeenCalledOnce();
});

it("defaults to Close and supports disabling", () => {
  render(() => <CloseButton disabled onClick={() => undefined} />);
  expect(screen.getByRole<HTMLButtonElement>("button", { name: "Close" }).disabled).toBe(true);
});
