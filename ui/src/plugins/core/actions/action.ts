import type { AuthenticatedUser } from "../authentication/authentication-service";
import type { QueryValue } from "../query/query-result";

declare const actionIdBrand: unique symbol;
export type ActionId = string & { readonly [actionIdBrand]: true };

export function actionId(value: string): ActionId {
  if (!value.trim()) throw new Error("Action ID must not be blank");
  return value as ActionId;
}

export interface EntityRecordActionTarget {
  readonly type: "entity-record";
  readonly entityId: string;
  readonly recordId: string;
  readonly values: Readonly<Record<string, QueryValue>>;
  update(changes: Readonly<Record<string, QueryValue>>): Promise<void>;
  activate?(): void;
}

export type ActionTarget = EntityRecordActionTarget;

export interface ActionContext {
  readonly currentUser: AuthenticatedUser;
  readonly target?: ActionTarget;
}

export interface UiAction {
  readonly id: ActionId;
  readonly label: string;
  readonly description: string;
  readonly hotkey?: string;
  readonly showInActionBar?: boolean;
  readonly compatibleEntityTypes?: readonly string[];
  isAvailable(context: ActionContext): boolean;
  execute(context: ActionContext): void | Promise<void>;
}

export function normalizeHotkey(hotkey: string): string {
  const normalized = hotkey.toLocaleLowerCase();
  if ([...normalized].length !== 1) throw new Error(`Action hotkey '${hotkey}' must be one character`);
  return normalized;
}

export function validateActions(actions: readonly UiAction[]): void {
  const ids = new Set<string>();
  const hotkeys = new Set<string>();
  for (const action of actions) {
    if (!String(action.id).trim()) throw new Error("Action ID must not be blank");
    if (!action.label.trim()) throw new Error(`Action '${action.id}' must have a label`);
    if (!action.description.trim()) throw new Error(`Action '${action.id}' must have a description`);
    if (ids.has(action.id)) throw new Error(`Action '${action.id}' is registered more than once`);
    ids.add(action.id);
    if (action.hotkey) {
      const hotkey = normalizeHotkey(action.hotkey);
      if (hotkeys.has(hotkey)) throw new Error(`Action hotkey '${hotkey}' is registered more than once`);
      hotkeys.add(hotkey);
    }
    if (action.compatibleEntityTypes) {
      if (action.compatibleEntityTypes.length === 0)
        throw new Error(`Action '${action.id}' has an empty compatible entity type list`);
      const entityTypes = new Set<string>();
      for (const entityType of action.compatibleEntityTypes) {
        if (!entityType.trim()) throw new Error(`Action '${action.id}' has a blank compatible entity type`);
        if (entityTypes.has(entityType))
          throw new Error(`Action '${action.id}' repeats compatible entity type '${entityType}'`);
        entityTypes.add(entityType);
      }
    }
  }
}

export function isActionAvailable(action: UiAction, context: ActionContext): boolean {
  if (action.compatibleEntityTypes) {
    if (context.target?.type !== "entity-record") return false;
    if (!action.compatibleEntityTypes.includes(context.target.entityId)) return false;
  }
  return action.isAvailable(context);
}
