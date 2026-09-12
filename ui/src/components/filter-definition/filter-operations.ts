import {
  createFilterNodeId,
  type CompositeFilterDefinition,
  type FilterDefinition,
  type FilterNodeId,
} from "./filter-model";

export interface FilterMoveTarget {
  readonly parentId: FilterNodeId;
  readonly index: number;
}

export function findFilter(root: FilterDefinition, id: FilterNodeId): FilterDefinition | undefined {
  if (root.id === id) return root;
  if (root.type === "composite") {
    for (const child of root.children) {
      const found = findFilter(child, id);
      if (found) return found;
    }
  }
  return undefined;
}

export function updateFilter(
  root: FilterDefinition,
  id: FilterNodeId,
  update: (node: FilterDefinition) => FilterDefinition,
): FilterDefinition {
  if (root.id === id) return update(root);
  if (root.type !== "composite") return root;
  return { ...root, children: root.children.map((child) => updateFilter(child, id, update)) };
}

export function insertFilter(
  root: FilterDefinition,
  parentId: FilterNodeId,
  index: number,
  node: FilterDefinition,
): FilterDefinition {
  return updateFilter(root, parentId, (parent) => {
    if (parent.type !== "composite") throw new Error("Filters can only be inserted into composites");
    const children = [...parent.children];
    children.splice(Math.max(0, Math.min(index, children.length)), 0, node);
    return { ...parent, children };
  });
}

export function removeFilter(root: FilterDefinition, id: FilterNodeId): FilterDefinition {
  if (root.id === id) throw new Error("The root filter cannot be removed");
  if (root.type !== "composite") return root;
  return {
    ...root,
    children: root.children.filter((child) => child.id !== id).map((child) => removeFilter(child, id)),
  };
}

export function moveFilter(root: FilterDefinition, id: FilterNodeId, target: FilterMoveTarget): FilterDefinition {
  if (root.id === id) throw new Error("The root filter cannot be moved");
  const node = findFilter(root, id);
  const parent = findFilter(root, target.parentId);
  if (!node) throw new Error(`Unknown filter '${id}'`);
  if (parent?.type !== "composite") throw new Error(`Filter '${target.parentId}' is not a composite`);
  if (findFilter(node, target.parentId)) throw new Error("A filter cannot be moved into its own subtree");
  const original = findParent(root, id);
  let index = target.index;
  if (original?.id === target.parentId) {
    const oldIndex = original.children.findIndex((child) => child.id === id);
    if (oldIndex < index) index -= 1;
    if (oldIndex === index) return root;
  }
  return insertFilter(removeFilter(root, id), target.parentId, index, node);
}

export function moveFilterUp(root: FilterDefinition, id: FilterNodeId): FilterDefinition {
  const placement = findPlacement(root, id);
  return !placement || placement.index === 0
    ? root
    : moveFilter(root, id, { parentId: placement.parent.id, index: placement.index - 1 });
}

export function moveFilterDown(root: FilterDefinition, id: FilterNodeId): FilterDefinition {
  const placement = findPlacement(root, id);
  return !placement || placement.index === placement.parent.children.length - 1
    ? root
    : moveFilter(root, id, { parentId: placement.parent.id, index: placement.index + 2 });
}

export function indentFilter(root: FilterDefinition, id: FilterNodeId): FilterDefinition {
  const placement = findPlacement(root, id);
  const previous = placement?.parent.children[placement.index - 1];
  return previous?.type === "composite"
    ? moveFilter(root, id, { parentId: previous.id, index: previous.children.length })
    : root;
}

export function outdentFilter(root: FilterDefinition, id: FilterNodeId): FilterDefinition {
  const placement = findPlacement(root, id);
  if (!placement || placement.parent.id === root.id) return root;
  const parentPlacement = findPlacement(root, placement.parent.id);
  return parentPlacement
    ? moveFilter(root, id, { parentId: parentPlacement.parent.id, index: parentPlacement.index + 1 })
    : root;
}

export function duplicateFilter(root: FilterDefinition, id: FilterNodeId): FilterDefinition {
  if (root.id === id) return cloneWithNewIds(root);
  const parent = findParent(root, id);
  const node = findFilter(root, id);
  if (!parent || !node) throw new Error(`Unknown filter '${id}'`);
  const index = parent.children.findIndex((child) => child.id === id);
  return insertFilter(root, parent.id, index + 1, cloneWithNewIds(node));
}

export function copyFilter(root: FilterDefinition, id: FilterNodeId, target: FilterMoveTarget): FilterDefinition {
  const node = findFilter(root, id);
  if (!node) throw new Error(`Unknown filter '${id}'`);
  return insertFilter(root, target.parentId, target.index, cloneWithNewIds(node));
}

export function validateFilterDefinition(root: FilterDefinition): readonly string[] {
  const errors: string[] = [];
  const ids = new Set<FilterNodeId>();
  const visit = (node: FilterDefinition) => {
    if (ids.has(node.id)) errors.push(`Filter node '${node.id}' is defined more than once.`);
    ids.add(node.id);
    if (node.type === "composite") {
      if (isInvalidOneCompositeFilter(node)) {
        errors.push('A "One of" composite filter must contain at least one filter.');
      }
      node.children.forEach(visit);
    }
  };
  visit(root);
  return errors;
}

/** Returns whether a one-of composite has no enabled child to match. */
export function isInvalidOneCompositeFilter(filter: CompositeFilterDefinition): boolean {
  return filter.kind === "one" && !filter.children.some((child) => !child.disabled);
}

function findParent(root: FilterDefinition, id: FilterNodeId): CompositeFilterDefinition | undefined {
  if (root.type !== "composite") return undefined;
  if (root.children.some((child) => child.id === id)) return root;
  for (const child of root.children) {
    const found = findParent(child, id);
    if (found) return found;
  }
  return undefined;
}

function findPlacement(
  root: FilterDefinition,
  id: FilterNodeId,
): { readonly parent: CompositeFilterDefinition; readonly index: number } | undefined {
  const parent = findParent(root, id);
  if (!parent) return undefined;
  return { parent, index: parent.children.findIndex((child) => child.id === id) };
}

function cloneWithNewIds(node: FilterDefinition): FilterDefinition {
  if (node.type === "criterion") return { ...node, id: createFilterNodeId() };
  return { ...node, id: createFilterNodeId(), children: node.children.map(cloneWithNewIds) };
}
