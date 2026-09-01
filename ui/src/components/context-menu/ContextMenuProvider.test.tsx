import { cleanup, fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ContextMenuProvider, useContextMenu } from "./ContextMenuProvider";
import { type ContextMenuGroup, contextMenuEntryId, contextMenuGroupId } from "./context-menu";

afterEach(cleanup);

function Target(props: { createGroups: () => readonly ContextMenuGroup[] }) {
  const contextMenu = useContextMenu();
  return (
    <button type="button" onContextMenu={(event) => contextMenu.open({ event, createGroups: props.createGroups })}>
      Target
    </button>
  );
}

const groups = (execute = vi.fn(), suffix = "") => [
  {
    id: contextMenuGroupId("primary"),
    label: "Commands",
    entries: [
      {
        id: contextMenuEntryId("open"),
        label: `Open${suffix}`,
        description: "Open the record.",
        keyboardHint: "Enter",
        execute,
      },
      {
        id: contextMenuEntryId("disabled"),
        label: "Disabled",
        disabled: true,
        execute: vi.fn(),
      },
      { id: contextMenuEntryId("delete"), label: "Delete", execute: vi.fn() },
    ],
  },
];

describe("ContextMenuProvider", () => {
  it("creates entries for every imperative opening and replaces the open menu", () => {
    let count = 0;
    const createGroups = vi.fn(() => groups(undefined, ` ${++count}`));
    render(() => (
      <ContextMenuProvider>
        <Target createGroups={createGroups} />
      </ContextMenuProvider>
    ));
    const target = screen.getByRole("button", { name: "Target" });

    fireEvent.contextMenu(target, { clientX: 40, clientY: 50 });
    expect(screen.getByRole("menuitem", { name: /Open 1/ })).toBeTruthy();
    fireEvent.contextMenu(target, { clientX: 80, clientY: 90 });
    expect(screen.queryByRole("menuitem", { name: /Open 1/ })).toBeNull();
    expect(screen.getByRole("menuitem", { name: /Open 2/ })).toBeTruthy();
    expect(createGroups).toHaveBeenCalledTimes(2);
  });

  it("navigates enabled entries, executes them, and restores focus on keyboard dismissal", async () => {
    const execute = vi.fn();
    render(() => (
      <ContextMenuProvider>
        <Target createGroups={() => groups(execute)} />
      </ContextMenuProvider>
    ));
    const target = screen.getByRole("button", { name: "Target" });
    target.focus();
    fireEvent.contextMenu(target, { clientX: 20, clientY: 20 });
    const open = screen.getByRole("menuitem", { name: /Open/ });
    const remove = screen.getByRole("menuitem", { name: "Delete" });
    await waitFor(() => expect(document.activeElement).toBe(open));
    expect(screen.getByRole("tooltip").textContent).toBe("Open the record.");
    expect(open.querySelector('[role="tooltip"]')).toBeNull();
    fireEvent.keyDown(open, { key: "ArrowDown" });
    expect(document.activeElement).toBe(remove);
    expect(screen.queryByRole("tooltip")).toBeNull();
    fireEvent.keyDown(remove, { key: "Home" });
    expect(document.activeElement).toBe(open);
    fireEvent.keyDown(open, { key: "Enter" });
    expect(execute).toHaveBeenCalledOnce();
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(target);
  });

  it("does not open or suppress the native event for empty groups", () => {
    render(() => (
      <ContextMenuProvider>
        <Target createGroups={() => [{ id: contextMenuGroupId("empty"), entries: [] }]} />
      </ContextMenuProvider>
    ));
    const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    screen.getByRole("button", { name: "Target" }).dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("focuses a disabled-only menu and dismisses it with Escape", () => {
    render(() => (
      <ContextMenuProvider>
        <Target
          createGroups={() => [
            {
              id: contextMenuGroupId("disabled"),
              entries: [{ id: contextMenuEntryId("waiting"), label: "Waiting", disabled: true, execute: vi.fn() }],
            },
          ]}
        />
      </ContextMenuProvider>
    ));
    const target = screen.getByRole("button", { name: "Target" });
    target.focus();
    fireEvent.contextMenu(target);
    const menu = screen.getByRole("menu");
    expect(document.activeElement).toBe(menu);
    fireEvent.keyDown(menu, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(target);
  });

  it("clamps its measured position to the viewport and closes outside", () => {
    const bounds = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      width: 240,
      height: 160,
      top: 0,
      right: 240,
      bottom: 160,
      left: 0,
      toJSON: () => undefined,
    });
    render(() => (
      <ContextMenuProvider>
        <Target createGroups={() => groups()} />
      </ContextMenuProvider>
    ));
    fireEvent.contextMenu(screen.getByRole("button", { name: "Target" }), {
      clientX: window.innerWidth,
      clientY: window.innerHeight,
    });
    const menu = screen.getByRole("menu");
    expect(Number.parseFloat(menu.style.left)).toBeLessThan(window.innerWidth);
    expect(Number.parseFloat(menu.style.top)).toBeLessThan(window.innerHeight);
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("menu")).toBeNull();
    bounds.mockRestore();
  });
});
