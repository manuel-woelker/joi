import { folderTreeNodeKind, type TreeModel, type TreeNode, type TreeNodeId } from "./tree-model";

/** One currently visible node and its derived navigation metadata. */
export interface VisibleTreeNode {
  readonly node: TreeNode;
  readonly level: number;
  readonly parentId?: TreeNodeId;
}

/** Flattens expanded model branches in visual order. */
export function visibleTreeNodes(model: TreeModel, expanded: ReadonlySet<TreeNodeId>): readonly VisibleTreeNode[] {
  const visible: VisibleTreeNode[] = [];
  const append = (ids: readonly TreeNodeId[], level: number, parentId?: TreeNodeId) => {
    for (const id of ids) {
      const node = model.nodes.get(id);
      if (!node) continue;
      visible.push({ node, level, parentId });
      if (node.kind === folderTreeNodeKind && expanded.has(id)) append(node.children ?? [], level + 1, id);
    }
  };
  append(model.roots, 0);
  return visible;
}
