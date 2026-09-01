import { cleanup, fireEvent, render, screen } from "@solidjs/testing-library";
import { Show, createSignal, onCleanup } from "solid-js";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PluginRegistryBuilder, plugin } from "../plugins/registry";
import { ActionCommands } from "./ActionCommands";
import { ActionProvider, useActions } from "./ActionProvider";
import { actionId, type ActionTarget, type UiAction } from "./action";
import { actionContributions } from "./contribution";

afterEach(cleanup);

function registryWith(action: UiAction) {
  return new PluginRegistryBuilder()
    .register(
      plugin({
        name: "Actions",
        description: "Action extension point",
        registerExtensionPoints(context) {
          context.registerExtensionPoint({ point: actionContributions });
        },
      }),
    )
    .register(
      plugin({
        name: "Contribution",
        description: "Test action",
        registerExtensions(context) {
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

function TargetRegistration(props: { target: ActionTarget }) {
  const actions = useActions();
  onCleanup(actions.registerTarget(() => props.target));
  return null;
}

describe("ActionProvider", () => {
  it("dispatches guarded hotkeys and clears targets on owner cleanup", () => {
    const execute = vi.fn();
    const action: UiAction = {
      id: actionId("test.run"),
      label: "Run test",
      description: "Runs the test action.",
      hotkey: "x",
      compatibleEntityTypes: ["tickets"],
      isAvailable: () => true,
      execute,
    };
    const [targetVisible, setTargetVisible] = createSignal(true);
    const target: ActionTarget = {
      type: "entity-record",
      entityId: "tickets",
      recordId: "ticket-1",
      values: {},
      update: async () => undefined,
    };
    render(() => (
      <ActionProvider registry={registryWith(action)} currentUser={{ id: "user-1", username: "jane", name: "Jane" }}>
        <ActionCommands />
        <Show when={targetVisible()}>
          <TargetRegistration target={target} />
        </Show>
        <input aria-label="Editor" />
        <button type="button" onClick={() => setTargetVisible(false)}>
          Remove target
        </button>
      </ActionProvider>
    ));

    const input = screen.getByRole("textbox", { name: "Editor" });
    fireEvent.keyDown(input, { key: "x" });
    expect(execute).not.toHaveBeenCalled();
    fireEvent.keyDown(document, { key: "x", ctrlKey: true });
    expect(execute).not.toHaveBeenCalled();
    fireEvent.keyDown(document, { key: "X" });
    expect(execute).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "Remove target" }));
    expect(screen.queryByRole("button", { name: /Run test/ })).toBeNull();
  });

  it("rejects duplicate action IDs while constructing the registry", () => {
    const duplicate = actionId("duplicate");
    expect(() =>
      new PluginRegistryBuilder()
        .register(
          plugin({
            name: "Actions",
            description: "Action extension point",
            registerExtensionPoints(context) {
              context.registerExtensionPoint({ point: actionContributions });
            },
          }),
        )
        .register(
          plugin({
            name: "Contributions",
            description: "Duplicate actions",
            registerExtensions(context) {
              for (const id of ["one", "two"])
                context.registerExtension({
                  point: actionContributions,
                  id,
                  description: id,
                  value: {
                    id: duplicate,
                    label: id,
                    description: id,
                    isAvailable: () => true,
                    execute: () => undefined,
                  },
                });
            },
          }),
        )
        .build(),
    ).toThrow("registered more than once");
  });
});
