import FolderIcon from "lucide-solid/icons/folder";
import FolderOpenIcon from "lucide-solid/icons/folder-open";
import { createMemo, Show } from "solid-js";
import { Dynamic } from "solid-js/web";

import { contextMenuEntryId, contextMenuGroupId } from "../../../components/context-menu/context-menu";
import { useContextMenu } from "../../../components/context-menu/ContextMenuProvider";
import { IconButton } from "../../../components/IconButton";
import { Tree } from "../../../components/tree/Tree";
import { createTreeRendererRegistry, type TreeDefinition } from "../../../components/tree/tree-definition";
import {
  defineTreeFolder,
  defineTreeModel,
  defineTreeNode,
  folderTreeNodeKind,
  type TreeModel,
  type TreeNode,
  treeNodeId,
  treeNodeKind,
} from "../../../components/tree/tree-model";
import { useEntityRegistry } from "../entities/entity-registry";
import { useWorkspace } from "./controller";
import type { NavigationId } from "./model";
import styles from "./SavedViewNavigation.module.css";

const savedViewNodeKind = treeNodeKind("saved-view");

export function SavedViewNavigation(props: { embedded?: boolean } = {}) {
  const controller = useWorkspace();
  const contextMenu = useContextMenu();
  const entities = useEntityRegistry();
  const model = createMemo<TreeModel>(() =>
    defineTreeModel({
      roots: controller.workspace.rootItems,
      nodes: Object.values(controller.workspace.navigation).map((item) =>
        item.type === "folder"
          ? defineTreeFolder({ id: item.id, children: item.children })
          : defineTreeNode({ id: item.id, kind: savedViewNodeKind }),
      ),
    }),
  );
  const navigationItem = (node: TreeNode) => controller.workspace.navigation[node.id as NavigationId];
  const viewFor = (node: TreeNode) => {
    const item = navigationItem(node);
    return item?.type === "view" ? controller.workspace.views[item.viewId] : undefined;
  };
  const label = (node: TreeNode) => {
    const item = navigationItem(node);
    return item?.type === "folder" ? item.name : (viewFor(node)?.name ?? "Missing view");
  };
  const entityForNode = (node: TreeNode) => {
    const view = viewFor(node);
    const query = view ? controller.workspace.queries[view.queryId] : undefined;
    return query ? entities.require(query.entityId) : undefined;
  };
  const openContextMenu = (event: MouseEvent, node: TreeNode) => {
    const id = node.id as NavigationId;
    const item = navigationItem(node);
    const folder = item?.type === "folder" ? item : undefined;
    const viewItem = item?.type === "view" ? item : undefined;
    contextMenu.open({
      event,
      createGroups: () => [
        {
          id: contextMenuGroupId("create"),
          entries: folder
            ? [
                {
                  id: contextMenuEntryId("new-view"),
                  label: "New view",
                  description: `Create a view in ${label(node)}.`,
                  icon: () => <span>+</span>,
                  execute: () => controller.createView(id),
                },
              ]
            : [],
        },
        {
          id: contextMenuGroupId("item"),
          entries: [
            {
              id: contextMenuEntryId("rename"),
              label: "Rename",
              description: `Rename ${label(node)}.`,
              icon: () => <span>✎</span>,
              execute: () => controller.renameItem(id),
            },
            ...(viewItem
              ? [
                  {
                    id: contextMenuEntryId("duplicate"),
                    label: "Duplicate",
                    description: `Create a copy of ${label(node)}.`,
                    icon: () => <span>□</span>,
                    execute: () => controller.duplicate(viewItem.viewId),
                  },
                ]
              : []),
          ],
        },
        {
          id: contextMenuGroupId("ordering"),
          label: "Order",
          entries: [
            {
              id: contextMenuEntryId("move-up"),
              label: "Move up",
              description: "Move this entry one position up.",
              icon: () => <span>↑</span>,
              execute: () => controller.move(id, -1),
            },
            {
              id: contextMenuEntryId("move-down"),
              label: "Move down",
              description: "Move this entry one position down.",
              icon: () => <span>↓</span>,
              execute: () => controller.move(id, 1),
            },
          ],
        },
        {
          id: contextMenuGroupId("move-to"),
          label: "Move to",
          entries: [
            {
              id: contextMenuEntryId("move-to-root"),
              label: "Root",
              description: "Move this entry to the navigation root.",
              execute: () => controller.moveToFolder(id, undefined),
            },
            ...Object.values(controller.workspace.navigation)
              .filter((candidate) => candidate.type === "folder" && candidate.id !== id)
              .map((candidate) => ({
                id: contextMenuEntryId(`move-to-${candidate.id}`),
                label: candidate.type === "folder" ? candidate.name : "",
                description: `Move this entry to ${candidate.type === "folder" ? candidate.name : "the folder"}.`,
                icon: () => <FolderIcon size={14} />,
                execute: () => controller.moveToFolder(id, candidate.id),
              })),
          ],
        },
        {
          id: contextMenuGroupId("danger"),
          entries: [
            {
              id: contextMenuEntryId("delete"),
              label: "Delete",
              description: `Delete ${label(node)}.`,
              icon: () => <span>×</span>,
              execute: () => controller.remove(id),
            },
          ],
        },
      ],
    });
  };
  const commandButton = (node: TreeNode) => (
    <IconButton label={`Commands for ${label(node)}`} icon="…" onClick={(event) => openContextMenu(event, node)} />
  );
  const renderers = createTreeRendererRegistry(label)
    .replace(folderTreeNodeKind, (node, renderContext) => (
      <>
        <Dynamic
          component={renderContext.expanded ? FolderOpenIcon : FolderIcon}
          class={styles.entityIcon}
          size={16}
          aria-hidden="true"
        />
        <span>{label(node)}</span>
        {commandButton(node)}
      </>
    ))
    .register(savedViewNodeKind, (node) => (
      <>
        <Dynamic component={entityForNode(node)?.icon} class={styles.entityIcon} size={16} aria-hidden="true" />
        <span>{label(node)}</span>
        {commandButton(node)}
      </>
    ))
    .build();
  const definition: TreeDefinition = {
    renderers,
    isSelected: (node) => {
      const view = viewFor(node);
      const route = controller.navigation.activeRoute();
      return Boolean(view && route?.source === "workspace" && route.id === view.id);
    },
    onActivate: (node) => {
      const view = viewFor(node);
      if (view) controller.selectView(view.id);
    },
    onContextMenu: openContextMenu,
    move: {
      canMove: () => true,
      canMoveTo: (node, target) => {
        if (target.parentId === node.id) return false;
        const pending = [...(node.children ?? [])];
        while (pending.length) {
          const child = pending.pop();
          if (child === target.parentId) return false;
          if (child) pending.push(...(model().nodes.get(child)?.children ?? []));
        }
        return true;
      },
      move: (node, target) =>
        controller.moveToPosition(node.id as NavigationId, target.parentId as NavigationId | undefined, target.index),
    },
  };
  return (
    <section aria-label="My workspace">
      <Show when={!props.embedded}>
        <div class={styles.panelHeading}>
          <h2>My workspace</h2>
          <div class={styles.headingCommands}>
            <IconButton
              label="Create folder"
              icon={<FolderIcon size={17} />}
              onClick={() => controller.createFolder()}
            />
            <IconButton label="Create view" icon="+" onClick={() => controller.createView()} />
          </div>
        </div>
      </Show>
      <Tree
        class={styles.savedViewTree}
        ariaLabel="Saved views"
        model={model()}
        definition={definition}
        expanded={new Set([...controller.expandedFolders()].map(treeNodeId))}
        onExpandedChange={(expanded) =>
          controller.setExpandedFolders(new Set([...expanded].map((id) => id as NavigationId)))
        }
      />
    </section>
  );
}
