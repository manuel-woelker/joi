import { extensionPoint } from "../plugins/registry";
import type { ApplicationView } from "../views/view";

export type AdministrationContribution = ApplicationView;

export const administrationContributions = extensionPoint<AdministrationContribution>(
  "administration-contributions",
  "Adds views to the administration section",
);
