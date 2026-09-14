// @vitest-environment happy-dom

import { cleanup, render, screen } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { createSignal } from "solid-js";

import { Tabs, type TabDefinition } from "./Tabs";

const tabs: readonly TabDefinition[] = [
  { id: "one", label: "One", render: () => <p>First panel</p> },
  { id: "disabled", label: "Disabled", disabled: true, render: () => <p>Unavailable panel</p> },
  { id: "three", label: "Three", render: () => <p>Third panel</p> },
];

afterEach(cleanup);

describe("Tabs", () => {
  it("selects tabs and renders the matching panel", async () => {
    const user = userEvent.setup();
    const [selected, setSelected] = createSignal("one");
    render(() => <Tabs ariaLabel="Test tabs" tabs={tabs} selected={selected()} onSelect={setSelected} />);

    expect(screen.getByRole("tabpanel").textContent).toContain("First panel");
    await user.click(screen.getByRole("tab", { name: "Three" }));
    expect(screen.getByRole("tabpanel").textContent).toContain("Third panel");
  });

  it("supports wrapping arrow navigation and skips disabled tabs", async () => {
    const user = userEvent.setup();
    const [selected, setSelected] = createSignal("one");
    render(() => <Tabs ariaLabel="Test tabs" tabs={tabs} selected={selected()} onSelect={setSelected} />);

    const first = screen.getByRole("tab", { name: "One" });
    first.focus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Three" }).getAttribute("aria-selected")).toBe("true");
    await user.keyboard("{ArrowRight}");
    expect(first.getAttribute("aria-selected")).toBe("true");
  });
});
