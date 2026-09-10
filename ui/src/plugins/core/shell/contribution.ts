import type { Component, ParentComponent } from "solid-js";

import { extensionPoint } from "../../../base/plugin-registry";
import type { NavigationSelection } from "../../../base/navigation";
import type { ApplicationView } from "../../../views/view";

declare const shellContributionIdBrand: unique symbol;
export type ShellContributionId = string & { readonly [shellContributionIdBrand]: true };

export function shellContributionId(value: string): ShellContributionId {
  if (!value.trim()) throw new Error("Shell contribution IDs must not be empty");
  return value as ShellContributionId;
}

export interface OrderedContribution {
  readonly id: ShellContributionId;
  readonly order: number;
}

export interface ApplicationProviderContribution extends OrderedContribution {
  readonly component: ParentComponent;
}

export interface NavigationSectionContribution extends OrderedContribution {
  readonly component: Component;
}

export interface ViewResolverContribution extends OrderedContribution {
  resolve(selection: NavigationSelection): ApplicationView | undefined;
}

export interface ShellOverlayContribution extends OrderedContribution {
  readonly component: Component;
}

export interface TopBarContribution extends OrderedContribution {
  readonly component: Component;
}

const validateOrdered = <T extends OrderedContribution>(values: readonly T[]) => {
  const ids = new Set<ShellContributionId>();
  for (const value of values) {
    if (!value.id.trim()) throw new Error("Shell contribution IDs must not be empty");
    if (ids.has(value.id)) throw new Error(`Shell contribution '${value.id}' is registered more than once`);
    if (!Number.isFinite(value.order)) throw new Error(`Shell contribution '${value.id}' has an invalid order`);
    ids.add(value.id);
  }
};

export const applicationProviders = extensionPoint<ApplicationProviderContribution>(
  "application-providers",
  "Wraps the authenticated application with contributed Solid contexts",
  validateOrdered,
);
export const navigationSections = extensionPoint<NavigationSectionContribution>(
  "navigation-sections",
  "Adds sections to the application navigation",
  validateOrdered,
);
export const viewResolvers = extensionPoint<ViewResolverContribution>(
  "view-resolvers",
  "Resolves URL navigation state into application views",
  validateOrdered,
);
export const shellOverlays = extensionPoint<ShellOverlayContribution>(
  "shell-overlays",
  "Adds overlays beside the current application view",
  validateOrdered,
);
export const topBarContributions = extensionPoint<TopBarContribution>(
  "top-bar-contributions",
  "Adds commands and indicators to the application top bar",
  validateOrdered,
);
