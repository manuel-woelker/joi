import FolderIcon from "lucide-solid/icons/folder";
import FolderOpenIcon from "lucide-solid/icons/folder-open";
import type { JSX } from "solid-js";

import { folderTreeNodeKind, type TreeNode, type TreeNodeKind } from "./tree-model";

/** State supplied to a node renderer by the tree. */
export interface TreeNodeRenderContext {
  readonly level: number;
  readonly expanded: boolean;
  readonly selected: boolean;
}

/** Produces the visible content of one tree row. */
export type TreeNodeRenderer = (node: TreeNode, context: TreeNodeRenderContext) => JSX.Element;

/** Immutable renderer lookup keyed by node kind. */
export type TreeRendererRegistry = ReadonlyMap<TreeNodeKind, TreeNodeRenderer>;

/** A normalized insertion position within a tree model. */
export interface TreeMoveTarget {
  readonly parentId?: import("./tree-model").TreeNodeId;
  readonly index: number;
}

/** Optional mutable behavior supplied by an owning tree model. */
export interface TreeMoveDefinition {
  canMove(node: TreeNode): boolean;
  canMoveTo(node: TreeNode, target: TreeMoveTarget): boolean;
  move(node: TreeNode, target: TreeMoveTarget): void;
  /** Copies a node when the user holds Control or Alt while dropping. */
  copy?: (node: TreeNode, target: TreeMoveTarget) => void;
}

/** Accepts data dragged from outside this tree at a normalized tree position. */
export interface TreeExternalDropDefinition {
  canDrop(event: DragEvent, target: TreeMoveTarget): boolean;
  drop(event: DragEvent, target: TreeMoveTarget): void;
}

/** Visual and behavioral definition applied to a logical tree model. */
export interface TreeDefinition {
  readonly renderers: TreeRendererRegistry;
  readonly isSelected?: (node: TreeNode) => boolean;
  readonly isCollapsible?: (node: TreeNode) => boolean;
  readonly reserveDisclosureSpace?: boolean;
  readonly classForNode?: (node: TreeNode) => string | undefined;
  readonly onActivate?: (node: TreeNode) => void;
  readonly onContextMenu?: (event: MouseEvent, node: TreeNode) => void;
  readonly canDrag?: (node: TreeNode) => boolean;
  readonly onDragStart?: (event: DragEvent, node: TreeNode) => void;
  readonly move?: TreeMoveDefinition;
  readonly externalDrop?: TreeExternalDropDefinition;
}

/** Incrementally creates an immutable renderer registry. */
export class TreeRendererRegistryBuilder {
  readonly #renderers = new Map<TreeNodeKind, TreeNodeRenderer>();

  register(kind: TreeNodeKind, renderer: TreeNodeRenderer): this {
    if (this.#renderers.has(kind)) throw new Error(`Tree renderer "${kind}" is already registered`);
    this.#renderers.set(kind, renderer);
    return this;
  }

  replace(kind: TreeNodeKind, renderer: TreeNodeRenderer): this {
    if (!this.#renderers.has(kind)) throw new Error(`Tree renderer "${kind}" is not registered`);
    this.#renderers.set(kind, renderer);
    return this;
  }

  build(): TreeRendererRegistry {
    return new Map(this.#renderers);
  }
}

/** Creates the standard folder renderer with application-defined labels. */
export function createFolderTreeNodeRenderer(label: (node: TreeNode) => string): TreeNodeRenderer {
  return (node, context) => (
    <>
      {context.expanded ? <FolderOpenIcon size={16} aria-hidden="true" /> : <FolderIcon size={16} aria-hidden="true" />}
      <span>{label(node)}</span>
    </>
  );
}

/** Starts a renderer registry containing the built-in folder renderer. */
export function createTreeRendererRegistry(folderLabel: (node: TreeNode) => string): TreeRendererRegistryBuilder {
  return new TreeRendererRegistryBuilder().register(folderTreeNodeKind, createFolderTreeNodeRenderer(folderLabel));
}
