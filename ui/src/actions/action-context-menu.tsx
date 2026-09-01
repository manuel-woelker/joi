import type { ContextMenuEntry } from "../components/context-menu/context-menu";
import { contextMenuEntryId } from "../components/context-menu/context-menu";
import type { UiAction } from "./action";

export interface ActionContextMenuOptions {
  readonly disabled?: boolean;
  execute(action: UiAction): void | Promise<void>;
}

/** Converts currently available UI actions into context menu entries. */
export function actionsToContextMenuEntries(
  actions: readonly UiAction[],
  options: ActionContextMenuOptions,
): readonly ContextMenuEntry[] {
  return actions.map((action) => ({
    id: contextMenuEntryId(action.id),
    label: action.label,
    keyboardHint: action.hotkey,
    description: action.description,
    disabled: options.disabled,
    execute: () => options.execute(action),
  }));
}
