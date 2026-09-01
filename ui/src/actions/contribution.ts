import { extensionPoint } from "../plugins/registry";
import { validateActions, type UiAction } from "./action";

export const actionContributions = extensionPoint<UiAction>(
  "ui.actions",
  "User-triggered actions contributed to the application UI.",
  validateActions,
);
