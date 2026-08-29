import type { Component } from "solid-js";

import { extensionPoint } from "../plugins/registry";

export interface StatusBarContribution {
  readonly id: string;
  readonly order: number;
  readonly content: Component;
}

export const statusBarContributions = extensionPoint<StatusBarContribution>(
  "status-bar-contributions",
  "Adds items to the application status bar",
);
