import { createSignal } from "solid-js";

import type { ComponentDemo } from "../../playground/demo";
import { ContextMenuProvider, useContextMenu } from "./ContextMenuProvider";
import { contextMenuEntryId, contextMenuGroupId } from "./context-menu";

function DemoTarget(props: { dynamic?: boolean; edge?: boolean }) {
  const contextMenu = useContextMenu();
  const [opening, setOpening] = createSignal(0);
  const [message, setMessage] = createSignal("No command selected");
  return (
    <div
      style={{
        display: "grid",
        gap: "10px",
        width: props.edge ? "180px" : "320px",
        overflow: props.edge ? "hidden" : undefined,
        padding: "18px",
        border: "1px solid var(--color-border)",
        "border-radius": "6px",
        background: "var(--color-canvas)",
      }}
      onContextMenu={(event) => {
        const count = opening() + 1;
        setOpening(count);
        contextMenu.open({
          event,
          createGroups: () => [
            {
              id: contextMenuGroupId("editing"),
              label: "Editing",
              entries: [
                {
                  id: contextMenuEntryId("edit"),
                  label: props.dynamic ? `Edit after opening ${count}` : "Edit",
                  description: "Open this item in the editor.",
                  keyboardHint: "Enter",
                  icon: () => <span>✎</span>,
                  execute: () => {
                    setMessage("Edit selected");
                  },
                },
                {
                  id: contextMenuEntryId("duplicate"),
                  label: "Duplicate",
                  description: "Create a copy of this item.",
                  keyboardHint: "D",
                  icon: () => <span>□</span>,
                  execute: () => {
                    setMessage("Duplicate selected");
                  },
                },
              ],
            },
            {
              id: contextMenuGroupId("maintenance"),
              label: "Maintenance",
              entries: [
                {
                  id: contextMenuEntryId("archive"),
                  label: "Archive",
                  description: "Unavailable while the item has open dependencies.",
                  icon: () => <span>↓</span>,
                  disabled: true,
                  execute: () => undefined,
                },
              ],
            },
          ],
        });
      }}
    >
      <strong>Right-click this target</strong>
      <span style={{ color: "var(--color-text-muted)", "font-size": "12px" }}>{message()}</span>
    </div>
  );
}

const renderTarget = (props: Parameters<typeof DemoTarget>[0] = {}) => (
  <ContextMenuProvider>
    <DemoTarget {...props} />
  </ContextMenuProvider>
);

export default {
  name: "Context menu",
  description: "Imperatively opened command menus with lazy entries and grouped metadata.",
  scenarios: [
    {
      name: "Grouped commands",
      description: "Entries show icons, descriptions, keyboard hints, groups, and disabled state.",
      render: renderTarget,
    },
    {
      name: "Created on opening",
      description: "The label demonstrates that entries are recreated for every mouse opening.",
      render: () => renderTarget({ dynamic: true }),
    },
    {
      name: "Clipped target",
      description: "The portalled menu remains visible outside an overflow-clipped target.",
      render: () => renderTarget({ edge: true }),
    },
  ],
} satisfies ComponentDemo;
