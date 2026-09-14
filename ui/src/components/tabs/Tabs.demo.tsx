import { createSignal } from "solid-js";

import type { ComponentDemo } from "../../plugins/core/playground/demo";
import { Badge } from "../Badge";
import { Tabs, type TabDefinition } from "./Tabs";

function ControlledTabs(props: { readonly tabs: readonly TabDefinition[]; readonly initial: string }) {
  const [selected, setSelected] = createSignal(props.initial);
  return <Tabs ariaLabel="Example views" tabs={props.tabs} selected={selected()} onSelect={setSelected} />;
}

const accountTabs: readonly TabDefinition[] = [
  {
    id: "profile",
    label: "Profile",
    render: () => <p>Jane Developer maintains the frontend platform.</p>,
  },
  {
    id: "activity",
    label: "Activity",
    render: () => <p>12 commits and 4 reviews this week.</p>,
  },
  {
    id: "permissions",
    label: "Permissions",
    render: () => <p>Member of Engineering and Release Managers.</p>,
  },
];

export default {
  name: "Tabs",
  description: "Compact switching between related views with complete keyboard navigation.",
  scenarios: [
    {
      name: "Basic",
      description: "A controlled tab set with independently rendered panels.",
      render: () => <ControlledTabs tabs={accountTabs} initial="profile" />,
    },
    {
      name: "Disabled tab",
      description: "Keyboard navigation skips unavailable tabs.",
      render: () => (
        <ControlledTabs
          initial="summary"
          tabs={[
            { id: "summary", label: "Summary", render: () => <p>Review changes before publishing.</p> },
            { id: "checks", label: "Checks", render: () => <p>All required checks passed.</p> },
            { id: "deploy", label: "Deploy", disabled: true, render: () => <p>Deployment is unavailable.</p> },
          ]}
        />
      ),
    },
    {
      name: "Rich content",
      description: "Panels can render arbitrary components and structured content.",
      render: () => (
        <ControlledTabs
          initial="review"
          tabs={[
            {
              id: "review",
              label: "Review",
              render: () => (
                <div style={{ display: "flex", "align-items": "center", gap: "8px" }}>
                  <strong>Current status</strong>
                  <Badge tone="success">Approved</Badge>
                </div>
              ),
            },
            { id: "changes", label: "Changes", render: () => <code>8 files, +142 -37</code> },
          ]}
        />
      ),
    },
    {
      name: "Overflow",
      description: "Long tab lists scroll horizontally without compressing labels.",
      render: () => (
        <div style={{ width: "360px" }}>
          <ControlledTabs
            initial="overview"
            tabs={["Overview", "Details", "Dependencies", "Activity", "Permissions", "Audit log"].map((label) => ({
              id: label.toLocaleLowerCase().replaceAll(" ", "-"),
              label,
              render: () => <p>{label} content</p>,
            }))}
          />
        </div>
      ),
    },
  ],
} satisfies ComponentDemo;
