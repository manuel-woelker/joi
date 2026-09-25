// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { Show, createSignal, onCleanup } from "solid-js";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PluginRegistryBuilder, plugin } from "../../../base/plugin-registry";
import { entityId } from "../entities/entity-description";
import { ActionCommands } from "./ActionCommands";
import { ActionProvider, useActions } from "./ActionProvider";
import {
  actionId,
  type ActionTarget,
  type ActionTargetSelection,
  type ActionTargetUpdate,
  type UiAction,
} from "./action";
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

function TargetRegistration(props: { selection: ActionTargetSelection }) {
  const actions = useActions();
  onCleanup(actions.registerTarget(() => props.selection));
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
      compatibleEntityTypes: [entityId("tickets")],
      isAvailable: () => true,
      execute,
    };
    const [targetVisible, setTargetVisible] = createSignal(true);
    const target: ActionTarget = {
      type: "entity-record",
      entityId: entityId("tickets"),
      recordId: "ticket-1",
      values: {},
      update: async () => undefined,
    };
    render(() => (
      <ActionProvider registry={registryWith(action)} currentUser={{ id: "user-1", username: "jane", name: "Jane" }}>
        <ActionCommands />
        <Show when={targetVisible()}>
          <TargetRegistration selection={{ targets: [target], applyUpdates: async () => undefined }} />
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

  it("runs an entity action per eligible target and applies one update batch", async () => {
    const applyUpdates = vi.fn(async (_updates: readonly ActionTargetUpdate[]) => undefined);
    const action: UiAction = {
      id: actionId("test.assign"),
      label: "Assign",
      description: "Assigns records.",
      hotkey: "i",
      compatibleEntityTypes: [entityId("tickets")],
      isAvailable: ({ target }) => target?.values.assignee !== "user-1",
      execute: async ({ target }) => {
        await target?.update({ assignee: "other" });
        await target?.update({ assignee: "user-1" });
      },
    };
    const targets: ActionTarget[] = ["a", "b", "c"].map((recordId) => ({
      type: "entity-record",
      entityId: entityId("tickets"),
      recordId,
      values: { assignee: recordId === "c" ? "user-1" : "" },
      update: async () => undefined,
    }));
    render(() => (
      <ActionProvider registry={registryWith(action)} currentUser={{ id: "user-1", username: "jane", name: "Jane" }}>
        <ActionCommands />
        <TargetRegistration selection={{ targets, applyUpdates }} />
      </ActionProvider>
    ));
    fireEvent.keyDown(document, { key: "i" });
    await waitFor(() => expect(applyUpdates).toHaveBeenCalledOnce());
    expect(applyUpdates.mock.calls[0]?.[0].map(({ target }: { target: ActionTarget }) => target.recordId)).toEqual([
      "a",
      "b",
    ]);
    expect(applyUpdates.mock.calls[0]?.[0].map(({ changes }) => changes)).toEqual([
      { assignee: "user-1" },
      { assignee: "user-1" },
    ]);
  });

  it("does not apply staged updates if a later target fails", async () => {
    const applyUpdates = vi.fn(async () => undefined);
    const action: UiAction = {
      id: actionId("test.fail"),
      label: "Fail",
      description: "Fails after staging one update.",
      hotkey: "f",
      compatibleEntityTypes: [entityId("tickets")],
      isAvailable: () => true,
      execute: async ({ target }) => {
        if (target?.recordId === "b") throw new Error("second target failed");
        await target?.update({ assignee: "user-1" });
      },
    };
    const targets: ActionTarget[] = ["a", "b"].map((recordId) => ({
      type: "entity-record",
      entityId: entityId("tickets"),
      recordId,
      values: {},
      update: async () => undefined,
    }));
    render(() => (
      <ActionProvider registry={registryWith(action)} currentUser={{ id: "user-1", username: "jane", name: "Jane" }}>
        <ActionCommands />
        <TargetRegistration selection={{ targets, applyUpdates }} />
      </ActionProvider>
    ));
    fireEvent.keyDown(document, { key: "f" });
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("second target failed"));
    expect(applyUpdates).not.toHaveBeenCalled();
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
