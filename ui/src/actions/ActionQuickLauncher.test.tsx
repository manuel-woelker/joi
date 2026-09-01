import { cleanup, fireEvent, render, screen } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PluginRegistryBuilder, plugin } from "../plugins/registry";
import { ActionProvider } from "./ActionProvider";
import { ActionQuickLauncher } from "./ActionQuickLauncher";
import { actionId, type UiAction } from "./action";
import { actionContributions } from "./contribution";

afterEach(cleanup);

const createAction = (id: string, label: string, description: string, execute = vi.fn()): UiAction => ({
  id: actionId(id),
  label,
  description,
  isAvailable: () => true,
  execute,
});

function registryWith(actions: readonly UiAction[]) {
  return new PluginRegistryBuilder()
    .register(
      plugin({
        name: "Actions",
        description: "Registers actions",
        registerExtensionPoints(context) {
          context.registerExtensionPoint({ point: actionContributions });
        },
        registerExtensions(context) {
          for (const action of actions)
            context.registerExtension({
              point: actionContributions,
              id: action.id,
              description: action.description,
              value: action,
            });
        },
      }),
    )
    .build();
}

function Launcher(props: { actions: readonly UiAction[] }) {
  return (
    <ActionProvider
      registry={registryWith(props.actions)}
      currentUser={{ id: "user-1", username: "jane", name: "Jane" }}
    >
      <ActionQuickLauncher />
      <input aria-label="Editor" />
    </ActionProvider>
  );
}

describe("ActionQuickLauncher", () => {
  it("opens globally, filters actions, and executes the selected result", async () => {
    const first = createAction("test.alpha", "Alpha action", "Runs the first command");
    const executeSecond = vi.fn();
    const second = createAction("test.beta", "Beta action", "Runs the second command", executeSecond);
    render(() => <Launcher actions={[first, second]} />);
    const editor = screen.getByRole("textbox", { name: "Editor" });
    editor.focus();

    fireEvent.keyDown(editor, { key: "A", ctrlKey: true, shiftKey: true });
    const search = screen.getByRole("combobox", { name: "Filter actions" });
    expect(document.activeElement).toBe(search);
    await userEvent.type(search, "second");
    expect(screen.queryByRole("option", { name: /Alpha action/ })).toBeNull();
    expect(screen.getByRole("option", { name: /Beta action/ }).getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(search, { key: "Enter" });

    expect(executeSecond).toHaveBeenCalledOnce();
    expect(screen.queryByRole("dialog", { name: "Run action" })).toBeNull();
    expect(document.activeElement).toBe(editor);
  });

  it("moves selection with arrow keys and restores focus on Escape", () => {
    render(() => (
      <Launcher
        actions={[
          createAction("test.alpha", "Alpha action", "First"),
          createAction("test.beta", "Beta action", "Second"),
        ]}
      />
    ));
    const editor = screen.getByRole("textbox", { name: "Editor" });
    editor.focus();
    fireEvent.keyDown(document, { key: "a", ctrlKey: true, shiftKey: true });
    const search = screen.getByRole("combobox", { name: "Filter actions" });

    expect(screen.getByRole("option", { name: /Alpha action/ }).getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(search, { key: "Tab" });
    expect(document.activeElement).toBe(search);
    fireEvent.keyDown(search, { key: "ArrowDown" });
    expect(screen.getByRole("option", { name: /Beta action/ }).getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(search, { key: "ArrowUp" });
    expect(screen.getByRole("option", { name: /Alpha action/ }).getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(search, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Run action" })).toBeNull();
    expect(document.activeElement).toBe(editor);
  });

  it("shows an empty state when no actions match", async () => {
    render(() => <Launcher actions={[createAction("test.alpha", "Alpha action", "First")]} />);
    fireEvent.keyDown(document, { key: "a", ctrlKey: true, shiftKey: true });
    await userEvent.type(screen.getByRole("combobox", { name: "Filter actions" }), "missing");

    expect(screen.getByText("No matching actions")).toBeTruthy();
    expect(screen.queryByRole("option")).toBeNull();
  });
});
