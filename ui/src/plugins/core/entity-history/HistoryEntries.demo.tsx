import type { ComponentDemo } from "../playground/demo";
import type { HistoryEntry } from "../../../generated/api/api";
import { HistoryEntries } from "./HistoryEntries";
import styles from "./HistoryEntries.module.css";

const entries: readonly HistoryEntry[] = [
  {
    id: "history-delete",
    entityId: "ticket-1",
    userid: "deleted-user",
    timestamp: "2026-09-26T10:15:00Z",
    type: "Delete",
    changes: [
      { key: "title", oldValue: "Review project permissions", newValue: undefined },
      { key: "retired_attribute", oldValue: "Legacy value", newValue: undefined },
    ],
  },
  {
    id: "history-update",
    entityId: "ticket-1",
    userid: "jane",
    timestamp: "2026-09-26T10:10:00Z",
    type: "Update",
    changes: [
      { key: "title", oldValue: "Review permissions", newValue: "Review project permissions" },
      { key: "assignee", oldValue: "joe", newValue: null },
      {
        key: "description",
        oldValue: "",
        newValue: `<p>${"Review account and project access. ".repeat(20)}</p><script>alert('never executed')</script>`,
      },
    ],
  },
  {
    id: "history-create",
    entityId: "ticket-1",
    userid: "system",
    timestamp: "2026-09-26T10:00:00Z",
    type: "Create",
    changes: [
      { key: "title", oldValue: undefined, newValue: "Review permissions" },
      { key: "description", oldValue: undefined, newValue: "" },
    ],
  },
];
const fields = [
  { attribute: "title", label: "Title", control: "text" as const },
  { attribute: "description", label: "Description", control: "html" as const },
  { attribute: "assignee", label: "Assignee", control: "text" as const },
];
export default {
  name: "Entity History",
  description: "Recorded entity changes with actor attribution and before/after values.",
  scenarios: [
    {
      name: "Entity lifecycle",
      description: "Creation, updates, deletion, absent values, null, escaped HTML, and unknown users.",
      render: () => (
        <div class={styles.demo}>
          <HistoryEntries entries={entries} fields={fields} />
        </div>
      ),
    },
    { name: "No history", render: () => <HistoryEntries entries={[]} fields={fields} /> },
  ],
} satisfies ComponentDemo;
