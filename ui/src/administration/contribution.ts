import type { Component } from "solid-js";

import { extensionPoint } from "../plugins/registry";

export interface AdministrationContribution {
  readonly id: string;
  readonly name: string;
  readonly content: Component;
}

export const administrationContributions = extensionPoint<AdministrationContribution>(
  "administration-contributions",
  "Adds views to the administration section",
);
