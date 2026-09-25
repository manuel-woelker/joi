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
import type { PluginRegistryAccess } from "../../../base/plugin-registry";
import { actionContributions } from "./contribution";
import {
  isActionAvailable,
  normalizeHotkey,
  type ActionId,
  type ActionTargetSelection,
  type ActionTargetUpdate,
  type UiAction,
} from "./action";

interface ActionController {
  readonly availableActions: Accessor<readonly UiAction[]>;
  readonly pendingAction: Accessor<ActionId | undefined>;
  readonly error: Accessor<Error | undefined>;
  registerTarget(selection: Accessor<ActionTargetSelection | undefined>): () => void;
  execute(action: UiAction): Promise<void>;
}

const ActionContext = createContext<ActionController>();

export function ActionProvider(props: ParentProps<{ registry: PluginRegistryAccess; currentUser: AuthenticatedUser }>) {
  const actions = props.registry.extensions(actionContributions);
  const emptySelection: Accessor<ActionTargetSelection | undefined> = () => undefined;
  const [selectionAccessor, setSelectionAccessor] =
    createSignal<Accessor<ActionTargetSelection | undefined>>(emptySelection);
  const [pendingAction, setPendingAction] = createSignal<ActionId>();
  const [error, setError] = createSignal<Error>();
  const selection = () => selectionAccessor()();
  const eligibleTargets = (action: UiAction) =>
    (selection()?.targets ?? []).filter((target) =>
      isActionAvailable(action, { currentUser: props.currentUser, target }),
    );
  const availableActions = createMemo(() =>
    actions
      .filter((action) =>
        action.compatibleEntityTypes
          ? eligibleTargets(action).length > 0
          : isActionAvailable(action, { currentUser: props.currentUser, target: selection()?.targets[0] }),
      )
      .sort((a, b) => a.label.localeCompare(b.label)),
  );
  const execute = async (action: UiAction) => {
    if (pendingAction() || !availableActions().includes(action)) return;
    setPendingAction(action.id);
    setError(undefined);
    try {
      const currentSelection = selection();
      if (!action.compatibleEntityTypes) {
        await action.execute({ currentUser: props.currentUser, target: currentSelection?.targets[0] });
      } else if (currentSelection) {
        const updates: ActionTargetUpdate[] = [];
        const updateIndexes = new Map<(typeof currentSelection.targets)[number], number>();
        const targets = currentSelection.targets.filter((target) =>
          isActionAvailable(action, { currentUser: props.currentUser, target }),
        );
        for (const target of targets) {
          await action.execute({
            currentUser: props.currentUser,
            target: {
              ...target,
              update: async (changes) => {
                const index = updateIndexes.get(target);
                if (index === undefined) {
                  updateIndexes.set(target, updates.length);
                  updates.push({ target, changes });
                } else {
                  updates[index] = { target, changes: { ...updates[index].changes, ...changes } };
                }
              },
            },
          });
        }
        if (updates.length) await currentSelection.applyUpdates(updates);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause : new Error(String(cause)));
    } finally {
      setPendingAction(undefined);
    }
  };
  const registerTarget = (target: Accessor<ActionTargetSelection | undefined>) => {
    setSelectionAccessor(() => target);
    return () => {
      if (selectionAccessor() === target) setSelectionAccessor(() => emptySelection);
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
