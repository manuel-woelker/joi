import { cleanup, render, screen } from "@solidjs/testing-library";
import { afterEach, describe, expect, it } from "vitest";

import { KeyboardShortcut } from "./KeyboardShortcut";

afterEach(cleanup);

describe("KeyboardShortcut", () => {
  it("renders combined keys as separate semantic keycaps", () => {
    render(() => <KeyboardShortcut shortcut="Ctrl+C" />);

    const shortcut = screen.getByLabelText("Ctrl+C");
    expect(Array.from(shortcut.querySelectorAll("kbd"), (key) => key.textContent)).toEqual(["Ctrl", "C"]);
    expect(shortcut.textContent).toBe("Ctrl+C");
  });

  it("supports literal plus keys and custom accessible labels", () => {
    render(() => <KeyboardShortcut keys={["Ctrl", "+"]} ariaLabel="Zoom in" />);

    expect(screen.getByLabelText("Zoom in").textContent).toBe("Ctrl++");
  });

  it("rejects blank key labels", () => {
    expect(() => render(() => <KeyboardShortcut keys={["Ctrl", " "]} />)).toThrow("must not be blank");
  });
});
