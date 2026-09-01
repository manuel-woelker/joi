import { describe, expect, it } from "vitest";

import {
  type ContextMenuGroup,
  contextMenuEntryId,
  contextMenuGroupId,
  validateContextMenuGroups,
} from "./context-menu";

const group = (overrides: Partial<ContextMenuGroup> = {}): ContextMenuGroup => ({
  id: contextMenuGroupId("group"),
  entries: [{ id: contextMenuEntryId("entry"), label: "Entry", execute: () => undefined }],
  ...overrides,
});

describe("context menu contracts", () => {
  it("rejects duplicate group and entry IDs", () => {
    expect(() => validateContextMenuGroups([group(), group()])).toThrow("group 'group' is repeated");
    expect(() =>
      validateContextMenuGroups([
        group({
          entries: [
            { id: contextMenuEntryId("entry"), label: "First", execute: () => undefined },
            { id: contextMenuEntryId("entry"), label: "Second", execute: () => undefined },
          ],
        }),
      ]),
    ).toThrow("entry 'entry' is repeated");
  });

  it("rejects blank labels and keyboard hints", () => {
    expect(() =>
      validateContextMenuGroups([
        group({ entries: [{ id: contextMenuEntryId("blank"), label: " ", execute: () => undefined }] }),
      ]),
    ).toThrow("must have a label");
    expect(() =>
      validateContextMenuGroups([
        group({
          entries: [
            { id: contextMenuEntryId("blank-hint"), label: "Entry", keyboardHint: " ", execute: () => undefined },
          ],
        }),
      ]),
    ).toThrow("blank keyboard hint");
  });
});
