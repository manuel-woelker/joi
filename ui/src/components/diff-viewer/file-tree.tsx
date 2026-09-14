import FileIcon from "lucide-solid/icons/file";
import FilePlusIcon from "lucide-solid/icons/file-plus";
import FileXIcon from "lucide-solid/icons/file-x";
import type { JSX } from "solid-js";
import { createTreeRendererRegistry, type TreeDefinition } from "../tree/tree-definition";
import {
  defineTreeFolder,
  defineTreeModel,
  defineTreeNode,
  treeNodeKind,
  type TreeModel,
  type TreeNode,
  type TreeNodeId,
} from "../tree/tree-model";
import type { DiffDocument, DiffFile, DiffFileId } from "./diff-model";

const diffFileKind = treeNodeKind("diff-file");

export interface DiffFileTree {
  readonly model: TreeModel;
  readonly expanded: ReadonlySet<TreeNodeId>;
  readonly fileByNode: ReadonlyMap<TreeNodeId, DiffFileId>;
}

/** Builds a filtered normalized tree while retaining matching files' ancestors. */
export function buildDiffFileTree(document: DiffDocument, filter: string): DiffFileTree {
  const tokens = filter.toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const files = document.files
    .map((id) => document.filesById.get(id))
    .filter(
      (file): file is DiffFile =>
        Boolean(file) && tokens.every((token) => file!.displayPath.toLocaleLowerCase().includes(token)),
    );
  const children = new Map<string, string[]>();
  const nodes = new Map<string, TreeNode>();
  const fileByNode = new Map<TreeNodeId, DiffFileId>();
  const roots: string[] = [];
  for (const file of files) {
    const segments = file.displayPath.split("/");
    let parent = "";
    for (const segment of segments.slice(0, -1)) {
      const path = parent ? `${parent}/${segment}` : segment;
      if (!nodes.has(`folder:${path}`)) {
        nodes.set(`folder:${path}`, defineTreeFolder({ id: `folder:${path}`, data: { label: segment } }));
        (parent ? children.get(`folder:${parent}`) : roots)?.push(`folder:${path}`);
      }
      if (!children.has(`folder:${path}`)) children.set(`folder:${path}`, []);
      parent = path;
    }
    const node = defineTreeNode({ id: `file:${file.id}`, kind: diffFileKind, data: { file, label: segments.at(-1) } });
    nodes.set(node.id, node);
    fileByNode.set(node.id, file.id);
    if (parent) children.get(`folder:${parent}`)?.push(node.id);
    else roots.push(node.id);
  }
  for (const [id, childIds] of children) {
    const current = nodes.get(id);
    nodes.set(id, defineTreeFolder({ id, children: childIds, data: current?.data }));
  }
  return {
    model: defineTreeModel({ roots, nodes: [...nodes.values()] }),
    expanded: new Set([...nodes.values()].filter((node) => node.children).map((node) => node.id)),
    fileByNode,
  };
}

export function diffFileTreeDefinition(
  tree: DiffFileTree,
  selected: DiffFileId | undefined,
  select: (id: DiffFileId) => void,
): TreeDefinition {
  const renderers = createTreeRendererRegistry((node) => String(node.data.label ?? ""))
    .register(diffFileKind, (node): JSX.Element => {
      const file = node.data.file as DiffFile;
      const Icon = file.status === "added" ? FilePlusIcon : file.status === "deleted" ? FileXIcon : FileIcon;
      return (
        <>
          <Icon size={15} aria-hidden="true" />
          <span>{String(node.data.label)}</span>
          <small>
            +{file.additions} -{file.deletions}
          </small>
        </>
      );
    })
    .build();
  return {
    renderers,
    isSelected: (node) => tree.fileByNode.get(node.id) === selected,
    onActivate: (node) => {
      const id = tree.fileByNode.get(node.id);
      if (id) select(id);
    },
  };
}
