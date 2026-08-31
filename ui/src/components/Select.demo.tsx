import { createSignal } from "solid-js";

import type { ComponentDemo } from "../playground/demo";
import { Select } from "./Select";

interface Person {
  id: string;
  name: string;
  role: string;
}

const people: Person[] = [
  { id: "jane", name: "Jane Developer", role: "Engineer" },
  { id: "joe", name: "Joe Tester", role: "Quality assurance" },
  { id: "alex", name: "Alex Builder", role: "Product manager" },
];

function BasicSelect() {
  const [value, setValue] = createSignal("jane");
  return (
    <div style={{ width: "320px" }}>
      <Select
        ariaLabel="User"
        value={value()}
        onChange={setValue}
        loadEntries={async () => ({ entries: people, total: people.length })}
        entryId={(entry) => entry.id}
        entryText={(entry) => entry.name}
        emptyLabel="Unassigned"
        placeholder="Search users"
      />
    </div>
  );
}

function RenderedSelect() {
  const [value, setValue] = createSignal("");
  return (
    <div style={{ width: "320px" }}>
      <Select
        ariaLabel="Team member"
        value={value()}
        onChange={setValue}
        loadEntries={async () => ({ entries: people, total: people.length })}
        entryId={(entry) => entry.id}
        entryText={(entry) => `${entry.name} ${entry.role}`}
        renderEntry={(entry) => (
          <div style={{ display: "grid", gap: "2px" }}>
            <strong>{entry.name}</strong>
            <span style={{ color: "var(--color-text-muted)", "font-size": "12px" }}>{entry.role}</span>
          </div>
        )}
        placeholder="Find a team member"
      />
    </div>
  );
}

function RemoteSelect() {
  const [value, setValue] = createSignal("");
  return (
    <div style={{ width: "320px" }}>
      <Select
        ariaLabel="Directory user"
        value={value()}
        onChange={setValue}
        loadEntries={async (query) => {
          await new Promise((resolve) => setTimeout(resolve, 250));
          return {
            entries: people.filter((entry) => entry.name.toLowerCase().includes(query.toLowerCase())),
            total: 12_000,
          };
        }}
        entryId={(entry) => entry.id}
        entryText={(entry) => entry.name}
        placeholder="Search directory"
      />
    </div>
  );
}

export default {
  name: "Select",
  description: "Searchable combobox for local lists and asynchronously queried data sources.",
  scenarios: [
    {
      name: "Local entries",
      description: "Small result sets are loaded once and filtered in memory.",
      render: BasicSelect,
    },
    {
      name: "Custom entries",
      description: "Entries can include secondary information and custom layout.",
      render: RenderedSelect,
    },
    {
      name: "Remote search",
      description: "Large result sets query the data source with a debounce.",
      render: RemoteSelect,
    },
  ],
} satisfies ComponentDemo;
