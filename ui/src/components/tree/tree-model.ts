const treeNodeIdBrand: unique symbol = Symbol("tree-node-id");
const treeNodeKindBrand: unique symbol = Symbol("tree-node-kind");

/** Stable identity for a node in a tree model. */
export type TreeNodeId = string & { readonly [treeNodeIdBrand]: true };

/** Identifies which renderer presents a tree node. */
export type TreeNodeKind = string & { readonly [treeNodeKindBrand]: true };

/** Creates a tree node ID from an application-owned stable identifier. */
export function treeNodeId(value: string): TreeNodeId {
  if (!value) throw new Error("Tree node IDs must not be empty");
  return value as TreeNodeId;
}

/** Creates a renderer kind identifier. */
export function treeNodeKind(value: string): TreeNodeKind {
  if (!value) throw new Error("Tree node kinds must not be empty");
  return value as TreeNodeKind;
}

/** Built-in kind for nodes that own child references. */
export const folderTreeNodeKind = treeNodeKind("folder");

/** One logical tree node. Only folder nodes may define `children`. */
export interface TreeNode {
  readonly id: TreeNodeId;
  readonly kind: TreeNodeKind;
  readonly data: Readonly<Record<string, unknown>>;
  readonly children?: readonly TreeNodeId[];
}

/** A normalized logical tree, independent from its visual definition. */
export interface TreeModel {
  readonly roots: readonly TreeNodeId[];
  readonly nodes: ReadonlyMap<TreeNodeId, TreeNode>;
}

export interface DefineTreeNodeOptions {
  readonly id: string;
  readonly kind: TreeNodeKind;
  readonly data?: Readonly<Record<string, unknown>>;
}

export interface DefineTreeFolderOptions {
  readonly id: string;
  readonly children?: readonly string[];
  readonly data?: Readonly<Record<string, unknown>>;
}

export interface DefineTreeModelOptions {
  readonly roots: readonly string[];
  readonly nodes: readonly TreeNode[];
}

/** Defines a non-folder node while applying ID branding and data defaults. */
export function defineTreeNode(options: DefineTreeNodeOptions): TreeNode {
  if (options.kind === folderTreeNodeKind) {
    throw new Error("Use defineTreeFolder to define folder nodes");
  }
  return {
    id: treeNodeId(options.id),
    kind: options.kind,
    data: options.data ?? {},
  };
}

/** Defines a built-in folder node with branded child references. */
export function defineTreeFolder(options: DefineTreeFolderOptions): TreeNode {
  return {
    id: treeNodeId(options.id),
    kind: folderTreeNodeKind,
    data: options.data ?? {},
    children: (options.children ?? []).map(treeNodeId),
  };
}

/** Builds and validates a normalized tree model from an ordered node list. */
export function defineTreeModel(options: DefineTreeModelOptions): TreeModel {
  const nodes = new Map<TreeNodeId, TreeNode>();
  for (const node of options.nodes) {
    if (nodes.has(node.id)) throw new Error(`Tree node "${node.id}" is defined more than once`);
    nodes.set(node.id, node);
  }
  const model: TreeModel = {
    roots: options.roots.map(treeNodeId),
    nodes,
  };
  validateTreeModel(model);
  return model;
}

/** Validates ownership and references in a normalized tree model. */
export function validateTreeModel(model: TreeModel): void {
  const rootPlacement = Symbol("root-placement");
  const parents = new Map<TreeNodeId, TreeNodeId | typeof rootPlacement>();

  for (const root of model.roots) registerPlacement(root, rootPlacement, parents, model);

  for (const node of model.nodes.values()) {
    const isFolder = node.kind === folderTreeNodeKind;
    if (isFolder && !node.children) throw new Error(`Folder node "${node.id}" must define children`);
    if (!isFolder && node.children) throw new Error(`Non-folder node "${node.id}" must not define children`);
    for (const child of node.children ?? []) registerPlacement(child, node.id, parents, model);
  }

  const visiting = new Set<TreeNodeId>();
  const cycleChecked = new Set<TreeNodeId>();
  const checkCycle = (id: TreeNodeId) => {
    if (visiting.has(id)) throw new Error(`Tree contains a cycle at node "${id}"`);
    if (cycleChecked.has(id)) return;
    visiting.add(id);
    for (const child of model.nodes.get(id)?.children ?? []) checkCycle(child);
    visiting.delete(id);
    cycleChecked.add(id);
  };
  for (const id of model.nodes.keys()) checkCycle(id);

  const reachable = new Set<TreeNodeId>();
  const visitReachable = (id: TreeNodeId) => {
    if (reachable.has(id)) return;
    reachable.add(id);
    for (const child of model.nodes.get(id)?.children ?? []) visitReachable(child);
  };
  for (const root of model.roots) visitReachable(root);

  const unreachable = [...model.nodes.keys()].filter((id) => !reachable.has(id));
  if (unreachable.length) throw new Error(`Tree contains unreachable node "${unreachable[0]}"`);
}

function registerPlacement(
  id: TreeNodeId,
  parent: TreeNodeId | symbol,
  parents: Map<TreeNodeId, TreeNodeId | symbol>,
  model: TreeModel,
): void {
  if (!model.nodes.has(id)) throw new Error(`Tree references missing node "${id}"`);
  if (typeof parent === "string" && id === parent) throw new Error(`Tree node "${id}" cannot contain itself`);
  const existing = parents.get(id);
  if (existing !== undefined) {
    throw new Error(`Tree node "${id}" is placed more than once`);
  }
  parents.set(id, parent);
}
