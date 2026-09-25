import type { ComponentDemo } from "../plugins/core/playground/demo";
import { DataText, FilterText, ModelText } from "./SourceText";

export default {
  name: "Source Text",
  description: "Inline treatments that distinguish data, model labels, and filter or query text from ordinary copy.",
  scenarios: [
    {
      name: "Sources",
      description: "Ordinary copy is unstyled; data, model, and filter or query text have distinct treatments.",
      render: () => (
        <div style={{ display: "grid", "grid-template-columns": "100px minmax(0, 1fr)", gap: "12px 20px" }}>
          <span>Interface</span>
          <span>Assigned to</span>
          <span>Data</span>
          <DataText>Jane Developer</DataText>
          <span>Model</span>
          <ModelText>Assignee</ModelText>
          <span>Query</span>
          <FilterText>updated_at DESC</FilterText>
          <span>Filter</span>
          <FilterText>status = "open"</FilterText>
        </div>
      ),
    },
    {
      name: "In context",
      description: "Source distinctions remain readable in an ordinary sentence.",
      render: () => (
        <p style={{ margin: 0, "line-height": 1.8 }}>
          Show <ModelText>Tickets</ModelText> where <FilterText>status = "open"</FilterText> ordered by{" "}
          <FilterText>updated_at DESC</FilterText>. <DataText>TEST-42</DataText> is the first result.
        </p>
      ),
    },
  ],
} satisfies ComponentDemo;
