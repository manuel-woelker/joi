import type { Component } from "solid-js";

import { extensionPoint } from "../../registry";

export interface DebugContribution {
  readonly id: string;
  readonly name: string;
  readonly group: DebugContributionGroup;
  readonly content: Component;
}

export type DebugContributionGroup = "info" | "frontend" | "backend";

export const debugContributions = extensionPoint<DebugContribution>(
  "debug-contributions",
  "Adds diagnostic views to the debug tools",
);
