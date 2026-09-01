import {
  createContext,
  createMemo,
  createSignal,
  onCleanup,
  onMount,
  useContext,
  type Accessor,
  type ParentProps,
} from "solid-js";

import type { AuthenticatedUser } from "../authentication/authentication-service";
import type { PluginRegistryAccess } from "../plugins/registry";
import { actionContributions } from "./contribution";
import { isActionAvailable, normalizeHotkey, type ActionId, type ActionTarget, type UiAction } from "./action";

interface ActionController {
  readonly availableActions: Accessor<readonly UiAction[]>;
  readonly pendingAction: Accessor<ActionId | undefined>;
  readonly error: Accessor<Error | undefined>;
  registerTarget(target: Accessor<ActionTarget | undefined>): () => void;
  execute(action: UiAction): Promise<void>;
}

const ActionContext = createContext<ActionController>();

export function ActionProvider(props: ParentProps<{ registry: PluginRegistryAccess; currentUser: AuthenticatedUser }>) {
  const actions = props.registry.extensions(actionContributions);
  const emptyTarget: Accessor<ActionTarget | undefined> = () => undefined;
  const [targetAccessor, setTargetAccessor] = createSignal<Accessor<ActionTarget | undefined>>(emptyTarget);
  const [pendingAction, setPendingAction] = createSignal<ActionId>();
  const [error, setError] = createSignal<Error>();
  const context = () => ({ currentUser: props.currentUser, target: targetAccessor()() });
  const availableActions = createMemo(() =>
    actions.filter((action) => isActionAvailable(action, context())).sort((a, b) => a.label.localeCompare(b.label)),
  );
  const execute = async (action: UiAction) => {
    if (pendingAction() || !availableActions().includes(action)) return;
    setPendingAction(action.id);
    setError(undefined);
    try {
      await action.execute(context());
    } catch (cause) {
      setError(cause instanceof Error ? cause : new Error(String(cause)));
    } finally {
      setPendingAction(undefined);
    }
  };
  const registerTarget = (target: Accessor<ActionTarget | undefined>) => {
    setTargetAccessor(() => target);
    return () => {
      if (targetAccessor() === target) setTargetAccessor(() => emptyTarget);
    };
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.defaultPrevented || event.isComposing || event.ctrlKey || event.altKey || event.metaKey || event.shiftKey)
      return;
    if (isEditable(event.target)) return;
    const action = availableActions().find((candidate) =>
      candidate.hotkey ? normalizeHotkey(candidate.hotkey) === event.key.toLocaleLowerCase() : false,
    );
    if (!action || pendingAction()) return;
    event.preventDefault();
    void execute(action);
  };
  onMount(() => document.addEventListener("keydown", onKeyDown));
  onCleanup(() => document.removeEventListener("keydown", onKeyDown));

  return (
    <ActionContext.Provider value={{ availableActions, pendingAction, error, registerTarget, execute }}>
      {props.children}
    </ActionContext.Provider>
  );
}

function isEditable(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.matches("input, textarea, select") || target.isContentEditable);
}

export function useActions(): ActionController {
  const controller = useContext(ActionContext);
  if (!controller) throw new Error("useActions must be called inside an ActionProvider");
  return controller;
}
