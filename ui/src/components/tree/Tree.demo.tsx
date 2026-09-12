import FileTextIcon from "lucide-solid/icons/file-text";
import GlobeIcon from "lucide-solid/icons/globe";
import { createSignal } from "solid-js";

import type { ComponentDemo } from "../../plugins/core/playground/demo";
import { Badge } from "../Badge";
import { contextMenuEntryId, contextMenuGroupId } from "../context-menu/context-menu";
import { ContextMenuProvider, useContextMenu } from "../context-menu/ContextMenuProvider";
import { Tree } from "./Tree";
import { createTreeRendererRegistry } from "./tree-definition";
import {
  defineTreeFolder,
  defineTreeModel,
  defineTreeNode,
  folderTreeNodeKind,
  type TreeNode,
  treeNodeId,
  treeNodeKind,
} from "./tree-model";

const documentKind = treeNodeKind("document");
const linkKind = treeNodeKind("link");
const guidesId = treeNodeId("guides");
const advancedId = treeNodeId("advanced");

const model = defineTreeModel({
  roots: [guidesId, "website"],
  nodes: [
    defineTreeFolder({
      id: guidesId,
      data: { label: "Guides and reference material with a deliberately long name" },
      children: ["getting-started", advancedId],
    }),
    defineTreeNode({
      id: "getting-started",
      kind: documentKind,
      data: { label: "Getting started", status: "New" },
    }),
    defineTreeFolder({ id: advancedId, data: { label: "Advanced" }, children: ["renderer-api"] }),
    defineTreeNode({
      id: "renderer-api",
      kind: documentKind,
      data: { label: "Renderer API", status: "Draft" },
    }),
    defineTreeNode({ id: "website", kind: linkKind, data: { label: "Project website" } }),
  ],
});

const label = (node: TreeNode) => String(node.data.label ?? node.id);
const renderers = createTreeRendererRegistry(label)
  .register(documentKind, (node) => (
    <>
      <FileTextIcon size={16} aria-hidden="true" />
      <span style={{ flex: 1 }}>{label(node)}</span>
      <Badge size="compact">{String(node.data.status)}</Badge>
    </>
  ))
  .register(linkKind, (node) => (
    <>
      <GlobeIcon size={16} aria-hidden="true" />
      <span>{label(node)}</span>
    </>
  ))
  .build();

function InteractiveTree() {
  const [selected, setSelected] = createSignal(treeNodeId("getting-started"));
  return (
    <div style={{ width: "360px", "max-width": "100%" }}>
      <Tree
        ariaLabel="Documentation"
        model={model}
        definition={{
          renderers,
          isSelected: (node) => node.id === selected(),
          onActivate: (node) => setSelected(node.id),
        }}
        defaultExpanded={new Set([guidesId])}
      />
    </div>
  );
}

function ControlledTree() {
  const [expanded, setExpanded] = createSignal<ReadonlySet<ReturnType<typeof treeNodeId>>>(new Set());
  return (
    <div style={{ display: "grid", width: "360px", "max-width": "100%", gap: "10px" }}>
      <button type="button" onClick={() => setExpanded(new Set([guidesId, advancedId]))}>
        Expand all
      </button>
      <Tree
        ariaLabel="Controlled documentation"
        model={model}
        definition={{ renderers }}
        expanded={expanded()}
        onExpandedChange={setExpanded}
      />
    </div>
  );
}

function ContextMenuTreeContent() {
  const contextMenu = useContextMenu();
  const [result, setResult] = createSignal("No command selected");
  return (
    <div style={{ display: "grid", width: "360px", "max-width": "100%", gap: "10px" }}>
      <Tree
        ariaLabel="Documentation commands"
        model={model}
        definition={{
          renderers,
          onContextMenu: (event, node) =>
            contextMenu.open({
              event,
              createGroups: () => [
                {
                  id: contextMenuGroupId("node"),
                  entries: [
                    {
                      id: contextMenuEntryId("open"),
                      label: node.kind === folderTreeNodeKind ? "Open folder" : "Open item",
                      description: `Open ${label(node)} in the main view.`,
                      keyboardHint: "Enter",
                      execute: () => {
                        setResult(`Opened ${label(node)}`);
                      },
                    },
                    {
                      id: contextMenuEntryId("rename"),
                      label: "Rename",
                      description: `Rename ${label(node)}.`,
                      keyboardHint: "F2",
                      execute: () => {
                        setResult(`Rename requested for ${label(node)}`);
                      },
                    },
                  ],
                },
                {
                  id: contextMenuGroupId("folder"),
                  label: "Folder",
                  entries:
                    node.kind === folderTreeNodeKind
                      ? [
                          {
                            id: contextMenuEntryId("new-child"),
                            label: "New child",
                            description: `Create an item in ${label(node)}.`,
                            execute: () => {
                              setResult(`New child requested in ${label(node)}`);
                            },
                          },
                        ]
                      : [],
                },
              ],
            }),
        }}
        defaultExpanded={new Set([guidesId])}
      />
      <span style={{ color: "var(--color-text-muted)", "font-size": "12px" }}>{result()}</span>
    </div>
  );
}

function ContextMenuTree() {
  return (
    <ContextMenuProvider>
      <ContextMenuTreeContent />
    </ContextMenuProvider>
  );
}

function MovableTree() {
  const [roots, setRoots] = createSignal(["website", "getting-started", "renderer-api"]);
  const movableModel = () =>
    defineTreeModel({
      roots: roots(),
      nodes: [
        defineTreeNode({ id: "website", kind: linkKind, data: { label: "Project website" } }),
        defineTreeNode({
          id: "getting-started",
          kind: documentKind,
          data: { label: "Getting started", status: "New" },
        }),
        defineTreeNode({ id: "renderer-api", kind: documentKind, data: { label: "Renderer API", status: "Draft" } }),
      ],
    });
  return (
    <div style={{ width: "360px", "max-width": "100%" }}>
      <Tree
        ariaLabel="Movable documentation"
        model={movableModel()}
        definition={{
          renderers,
          move: {
            canMove: () => true,
            canMoveTo: (_node, target) => target.parentId === undefined,
            move: (node, target) => {
              const next = roots().filter((id) => id !== node.id);
              next.splice(Math.min(target.index, next.length), 0, node.id);
              setRoots(next);
            },
          },
        }}
      />
    </div>
  );
}

export default {
  name: "Tree",
  description: "Normalized hierarchical data rendered through definitions for each node kind.",
  scenarios: [
    {
      name: "Mixed node kinds",
      description: "Folders, documents, links, selection, nested expansion, and long labels share one model.",
      render: InteractiveTree,
    },
    {
      name: "Controlled expansion",
      description: "The caller owns folder state and can update it independently of the tree.",
      render: ControlledTree,
    },
    {
      name: "Context menus",
      description: "Right-click a node to create commands for its current kind and data.",
      render: ContextMenuTree,
    },
    {
      name: "Drag reordering",
      description: "Drag rows to reorder an immutable model through normalized move targets.",
      render: MovableTree,
    },
    {
      name: "Empty tree",
      description: "An empty normalized model renders an accessible tree without placeholder content.",
      render: () => <Tree ariaLabel="Empty tree" model={{ roots: [], nodes: new Map() }} definition={{ renderers }} />,
    },
  ],
} satisfies ComponentDemo;
