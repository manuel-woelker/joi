import type { Component } from "solid-js";

import { extensionPoint, type PluginRegistry } from "../plugins/registry";

export interface DebugContribution {
  readonly id: string;
  readonly name: string;
  readonly content: Component<{ pluginRegistry: PluginRegistry }>;
}

export const debugContributions = extensionPoint<DebugContribution>(
  "debug-contributions",
  "Adds diagnostic views to the debug tools",
);
