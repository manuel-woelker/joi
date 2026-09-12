import { createEffect, createMemo, createSignal, For, type JSX, onCleanup, Show } from "solid-js";

import styles from "./Tree.module.css";
import type { TreeDefinition, TreeMoveTarget, TreeNodeRenderer } from "./tree-definition";
import { folderTreeNodeKind, type TreeModel, type TreeNode, type TreeNodeId, validateTreeModel } from "./tree-model";
import { visibleTreeNodes } from "./visible-tree";

export interface TreeProps {
  readonly ariaLabel: string;
  readonly model: TreeModel;
  readonly definition: TreeDefinition;
  readonly expanded?: ReadonlySet<TreeNodeId>;
  readonly defaultExpanded?: ReadonlySet<TreeNodeId>;
  readonly onExpandedChange?: (expanded: ReadonlySet<TreeNodeId>) => void;
  readonly class?: string;
}

/** Renders a normalized logical tree using kind-specific row renderers. */
export function Tree(props: TreeProps) {
  const [localExpanded, setLocalExpanded] = createSignal<ReadonlySet<TreeNodeId>>(new Set(props.defaultExpanded));
  const [focusedId, setFocusedId] = createSignal<TreeNodeId>();
  const [draggedId, setDraggedId] = createSignal<TreeNodeId>();
  const [dropTarget, setDropTarget] = createSignal<TreeMoveTarget>();
  const [dropOverId, setDropOverId] = createSignal<TreeNodeId>();
  let expandTimer: ReturnType<typeof setTimeout> | undefined;
  let expandTarget: TreeNodeId | undefined;
  onCleanup(() => clearTimeout(expandTimer));
  const rowElements = new Map<TreeNodeId, HTMLElement>();
  const expanded = () => props.expanded ?? localExpanded();
  const validatedModel = createMemo(() => {
    validateTreeModel(props.model);
    for (const node of props.model.nodes.values()) {
      if (!props.definition.renderers.has(node.kind)) {
        throw new Error(`Tree renderer for kind "${node.kind}" is not registered`);
      }
    }
    return props.model;
  });
  const visible = createMemo(() => visibleTreeNodes(validatedModel(), expanded()));

  createEffect(() => {
    const rows = visible();
    const current = focusedId();
    if (!rows.length) {
      if (current !== undefined) setFocusedId(undefined);
      return;
    }
    if (current === undefined || !rows.some((entry) => entry.node.id === current)) setFocusedId(rows[0].node.id);
  });

  const focus = (id: TreeNodeId) => {
    setFocusedId(id);
    queueMicrotask(() => rowElements.get(id)?.focus());
  };

  const updateExpanded = (next: ReadonlySet<TreeNodeId>) => {
    const snapshot = new Set(next);
    if (props.expanded === undefined) setLocalExpanded(snapshot);
    props.onExpandedChange?.(snapshot);
  };

  const toggle = (node: TreeNode) => {
    if (node.kind !== folderTreeNodeKind) return;
    const next = new Set(expanded());
    if (next.has(node.id)) {
      next.delete(node.id);
      const current = focusedId();
      if (current && current !== node.id && isDescendant(props.model, node.id, current)) focus(node.id);
    } else {
      next.add(node.id);
    }
    updateExpanded(next);
  };

  const activate = (node: TreeNode) => {
    if (node.kind === folderTreeNodeKind) toggle(node);
    else props.definition.onActivate?.(node);
  };

  const onKeyDown = (event: KeyboardEvent, node: TreeNode) => {
    const rows = visible();
    const index = rows.findIndex((entry) => entry.node.id === node.id);
    const current = rows[index];
    let destination: TreeNodeId | undefined;

    switch (event.key) {
      case "ArrowDown":
        destination = rows[index + 1]?.node.id;
        break;
      case "ArrowUp":
        destination = rows[index - 1]?.node.id;
        break;
      case "Home":
        destination = rows[0]?.node.id;
        break;
      case "End":
        destination = rows.at(-1)?.node.id;
        break;
      case "ArrowRight":
        if (node.kind === folderTreeNodeKind && !expanded().has(node.id)) toggle(node);
        else if (node.kind === folderTreeNodeKind) destination = node.children?.[0];
        break;
      case "ArrowLeft":
        if (node.kind === folderTreeNodeKind && expanded().has(node.id)) toggle(node);
        else destination = current?.parentId;
        break;
      case "Enter":
        activate(node);
        break;
      case " ":
        activate(node);
        break;
      default:
        return;
    }

    event.preventDefault();
    if (destination) focus(destination);
  };

  const renderBranch = (ids: readonly TreeNodeId[], level: number): JSX.Element => (
    <For each={ids}>
      {(id) => {
        const node = () => props.model.nodes.get(id) as TreeNode;
        const isFolder = () => node().kind === folderTreeNodeKind;
        const isExpanded = () => isFolder() && expanded().has(id);
        const isSelected = () => props.definition.isSelected?.(node()) ?? false;
        const renderer = () => props.definition.renderers.get(node().kind) as TreeNodeRenderer;
        const parentId = () => parentFor(props.model, id);
        const siblings = () => (parentId() ? (props.model.nodes.get(parentId()!)?.children ?? []) : props.model.roots);
        const rowIndex = () => siblings().indexOf(id);
        const targetForEvent = (event: DragEvent): TreeMoveTarget => {
          const parentId = parentFor(props.model, id);
          const bounds =
            event.currentTarget instanceof HTMLElement ? event.currentTarget.getBoundingClientRect() : undefined;
          if (isFolder() && bounds && event.clientX > bounds.left + 28 + level * 16) {
            return { parentId: id, index: node().children?.length ?? 0 };
          }
          const siblings = parentId ? (props.model.nodes.get(parentId)?.children ?? []) : props.model.roots;
          const index = siblings.indexOf(id) + (bounds && event.clientY > bounds.top + bounds.height / 2 ? 1 : 0);
          return { parentId, index };
        };
        return (
          <li role="none">
            <div
              role="treeitem"
              aria-expanded={isFolder() ? isExpanded() : undefined}
              aria-selected={isSelected() || undefined}
              ref={(element) => rowElements.set(id, element)}
              class={styles.row}
              classList={{
                [styles.selected]: isSelected(),
                [styles.dragging]: draggedId() === id,
                [styles.dropTarget]: dropOverId() === id && dropTarget()?.parentId === id,
                [styles.dropBefore]:
                  dropOverId() === id && dropTarget()?.parentId !== id && dropTarget()?.index === rowIndex(),
                [styles.dropAfter]:
                  dropOverId() === id && dropTarget()?.parentId !== id && dropTarget()?.index === rowIndex() + 1,
              }}
              style={{ "--tree-level": level }}
              tabindex={focusedId() === id ? 0 : -1}
              onFocus={() => setFocusedId(id)}
              onClick={(event) => {
                if ((event.target as Element).closest("button, a, input, select, textarea")) return;
                focus(id);
                activate(node());
              }}
              onKeyDown={(event) => onKeyDown(event, node())}
              onContextMenu={(event) => props.definition.onContextMenu?.(event, node())}
              draggable={
                props.definition.move?.canMove(node()) ||
                (Boolean(props.definition.onDragStart) && (props.definition.canDrag?.(node()) ?? true)) ||
                undefined
              }
              onDragStart={(event) => {
                if (props.definition.onDragStart && (props.definition.canDrag?.(node()) ?? true)) {
                  props.definition.onDragStart(event, node());
                  return;
                }
                if (!props.definition.move?.canMove(node())) {
                  event.preventDefault();
                  return;
                }
                setDraggedId(id);
                event.dataTransfer?.setData("text/plain", id);
                if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
              }}
              onDragOver={(event) => {
                const dragged = draggedId();
                const target = targetForEvent(event);
                const draggedNode = dragged ? props.model.nodes.get(dragged) : undefined;
                const acceptsMove = Boolean(
                  draggedNode && dragged !== id && props.definition.move?.canMoveTo(draggedNode, target),
                );
                const acceptsExternal = !dragged && Boolean(props.definition.externalDrop?.canDrop(event, target));
                if (!acceptsMove && !acceptsExternal) {
                  setDropTarget(undefined);
                  setDropOverId(undefined);
                  return;
                }
                event.preventDefault();
                setDropTarget(target);
                setDropOverId(id);
                if (target.parentId === id && isFolder() && !isExpanded() && expandTarget !== id) {
                  clearTimeout(expandTimer);
                  expandTarget = id;
                  expandTimer = setTimeout(() => toggle(node()), 500);
                } else if (target.parentId !== id) {
                  clearTimeout(expandTimer);
                  expandTarget = undefined;
                }
              }}
              onDrop={(event) => {
                const dragged = draggedId();
                const target = dropTarget();
                const draggedNode = dragged ? props.model.nodes.get(dragged) : undefined;
                if (draggedNode && target && props.definition.move?.canMoveTo(draggedNode, target)) {
                  event.preventDefault();
                  event.stopPropagation();
                  props.definition.move.move(draggedNode, target);
                } else if (target && props.definition.externalDrop?.canDrop(event, target)) {
                  event.preventDefault();
                  props.definition.externalDrop.drop(event, target);
                }
                setDraggedId(undefined);
                setDropTarget(undefined);
                setDropOverId(undefined);
                clearTimeout(expandTimer);
                expandTarget = undefined;
              }}
              onDragEnd={() => {
                setDraggedId(undefined);
                setDropTarget(undefined);
                setDropOverId(undefined);
                clearTimeout(expandTimer);
                expandTarget = undefined;
              }}
            >
              <Show when={isFolder()} fallback={<span class={styles.disclosureSpacer} />}>
                <button
                  type="button"
                  class={styles.disclosure}
                  aria-label={`${isExpanded() ? "Close" : "Open"} folder`}
                  onClick={() => {
                    focus(id);
                    toggle(node());
                  }}
                >
                  <span aria-hidden="true">{isExpanded() ? "⌄" : "›"}</span>
                </button>
              </Show>
              <div class={styles.content}>
                {renderer()(node(), { level, expanded: isExpanded(), selected: isSelected() })}
              </div>
            </div>
            <Show when={isFolder() && isExpanded() && node().children?.length}>
              <ul role="group">{renderBranch(node().children ?? [], level + 1)}</ul>
            </Show>
          </li>
        );
      }}
    </For>
  );

  return (
    <ul class={`${styles.tree}${props.class ? ` ${props.class}` : ""}`} role="tree" aria-label={props.ariaLabel}>
      {renderBranch(props.model.roots, 0)}
    </ul>
  );
}

function isDescendant(model: TreeModel, ancestorId: TreeNodeId, candidateId: TreeNodeId): boolean {
  const pending = [...(model.nodes.get(ancestorId)?.children ?? [])];
  while (pending.length) {
    const id = pending.pop();
    if (id === candidateId) return true;
    if (id) pending.push(...(model.nodes.get(id)?.children ?? []));
  }
  return false;
}

function parentFor(model: TreeModel, candidateId: TreeNodeId): TreeNodeId | undefined {
  for (const node of model.nodes.values()) {
    if (node.children?.includes(candidateId)) return node.id;
  }
  return undefined;
}
