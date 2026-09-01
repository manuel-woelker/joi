import type { JSX } from "solid-js";

declare const contextMenuEntryIdBrand: unique symbol;
export type ContextMenuEntryId = string & { readonly [contextMenuEntryIdBrand]: true };

declare const contextMenuGroupIdBrand: unique symbol;
export type ContextMenuGroupId = string & { readonly [contextMenuGroupIdBrand]: true };

export function contextMenuEntryId(value: string): ContextMenuEntryId {
  if (!value.trim()) throw new Error("Context menu entry ID must not be blank");
  return value as ContextMenuEntryId;
}

export function contextMenuGroupId(value: string): ContextMenuGroupId {
  if (!value.trim()) throw new Error("Context menu group ID must not be blank");
  return value as ContextMenuGroupId;
}

export interface ContextMenuEntry {
  readonly id: ContextMenuEntryId;
  readonly label: string;
  readonly keyboardHint?: string;
  readonly description?: string;
  readonly icon?: () => JSX.Element;
  readonly disabled?: boolean;
  execute(): void | Promise<void>;
}

export interface ContextMenuGroup {
  readonly id: ContextMenuGroupId;
  readonly label?: string;
  readonly entries: readonly ContextMenuEntry[];
}

export interface ContextMenuOpenContext {
  readonly event: MouseEvent;
  readonly x: number;
  readonly y: number;
}

export interface OpenContextMenuOptions {
  readonly event: MouseEvent;
  readonly createGroups: (context: ContextMenuOpenContext) => readonly ContextMenuGroup[];
}

export interface ContextMenuController {
  open(options: OpenContextMenuOptions): void;
  close(): void;
}

export function validateContextMenuGroups(groups: readonly ContextMenuGroup[]): void {
  const groupIds = new Set<string>();
  const entryIds = new Set<string>();
  for (const group of groups) {
    if (!String(group.id).trim()) throw new Error("Context menu group ID must not be blank");
    if (groupIds.has(group.id)) throw new Error(`Context menu group '${group.id}' is repeated`);
    groupIds.add(group.id);
    for (const entry of group.entries) {
      if (!String(entry.id).trim()) throw new Error("Context menu entry ID must not be blank");
      if (entryIds.has(entry.id)) throw new Error(`Context menu entry '${entry.id}' is repeated`);
      if (!entry.label.trim()) throw new Error(`Context menu entry '${entry.id}' must have a label`);
      if (entry.keyboardHint !== undefined && !entry.keyboardHint.trim())
        throw new Error(`Context menu entry '${entry.id}' has a blank keyboard hint`);
      entryIds.add(entry.id);
    }
  }
}
