import ChevronDownIcon from "lucide-solid/icons/chevron-down";
import ChevronRightIcon from "lucide-solid/icons/chevron-right";
import FolderIcon from "lucide-solid/icons/folder";
import FolderOpenIcon from "lucide-solid/icons/folder-open";
import ListMinusIcon from "lucide-solid/icons/list-minus";
import PlusIcon from "lucide-solid/icons/plus";
import { createEffect, createMemo, createSignal, For, Show, untrack } from "solid-js";
import { Dynamic } from "solid-js/web";

import type { NavigationRoute, NavigationSelection } from "../../../base/navigation";
import type { PluginRegistry } from "../../../base/plugin-registry";
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
  treeNodeKind,
} from "../../../components/tree/tree-model";
import { useWorkspace } from "../saved-views/controller";
import { SavedViewNavigation } from "../saved-views/SavedViewNavigation";
import type { NavigationEntryId, NavigationLeafContribution, NavigationRootContribution } from "./contribution";
import { navigationSection, validateNavigationRoots } from "./contribution";
import { addRecent, leafEntries, referenceForSelection, type RecentViewReference } from "./recent-views";
import {
  copyForLeaf,
  copyForWorkspaceView,
  readWorkspaceCopy,
  workspaceEntryMimeType,
  writeWorkspaceCopy,
} from "./workspace-copy";
import type { WorkspaceEntryDraft } from "../saved-views/model";
import styles from "./ApplicationNavigation.module.css";

const systemLeafKind = treeNodeKind("system-navigation-leaf");
const recentLeafKind = treeNodeKind("recent-navigation-leaf");
type ResolvedRecent = {
  readonly reference: RecentViewReference;
  readonly label: string;
  readonly icon?: NavigationLeafContribution["icon"];
  readonly selection: NavigationSelection;
  readonly copy: WorkspaceEntryDraft;
};

export function ApplicationNavigation(props: { registry: PluginRegistry; userId: string }) {
  const workspace = useWorkspace();
  const contextMenu = useContextMenu();
  const sections = [...props.registry.extensions(navigationSection)].sort(
    (left, right) => left.order - right.order || left.label.localeCompare(right.label),
  );
  validateNavigationRoots(sections);
  const allLeaves = createMemo(() => sections.flatMap((section) => leafEntries(section.roots())));
  const recentKey = `joi.recent-views.${props.userId}`;
  const [recent, setRecent] = createSignal<RecentViewReference[]>(loadRecent(recentKey));
  const [recentOpen, setRecentOpen] = createSignal(localStorage.getItem("joi.navigation.recent-open") !== "false");
  const [openSystem, setOpenSystem] = createSignal<string | undefined>(
    localStorage.getItem("joi.navigation.system-open") ?? undefined,
  );
  const [workspaceDropActive, setWorkspaceDropActive] = createSignal(false);

  createEffect(() => {
    const reference = referenceForSelection(workspace.navigation.selection(), allLeaves(), workspace.workspace);
    if (!reference) return;
    const current = untrack(recent);
    const next = addRecent(current, reference);
    if (JSON.stringify(next) === JSON.stringify(current)) return;
    setRecent(next);
    localStorage.setItem(recentKey, JSON.stringify(next));
  });

  createEffect(() => {
    const leaves = allLeaves();
    const current = recent();
    const valid = current.filter((reference) =>
      reference.type === "system"
        ? leaves.some((leaf) => leaf.id === reference.entryId)
        : Boolean(workspace.workspace.views[reference.viewId]),
    );
    if (valid.length === current.length) return;
    setRecent(valid);
    localStorage.setItem(recentKey, JSON.stringify(valid));
  });

  const navigate = (selection: NavigationSelection, route: NavigationRoute) => {
    const owner = selection.type === "record" || selection.type === "create" ? selection.owner : selection;
    if (owner.type === "view") workspace.navigation.selectView(owner.id, route);
  };
  const setSystemOpen = (id: string | undefined) => {
    setOpenSystem(id);
    if (id) localStorage.setItem("joi.navigation.system-open", id);
    else localStorage.removeItem("joi.navigation.system-open");
  };
  const toggleRecent = () => {
    const next = !recentOpen();
    setRecentOpen(next);
    localStorage.setItem("joi.navigation.recent-open", String(next));
  };

  const resolvedRecent = createMemo<ResolvedRecent[]>(() => {
    const resolved: ResolvedRecent[] = [];
    for (const reference of recent()) {
      if (reference.type === "system") {
        const section = sections.find((candidate) => candidate.id === reference.section);
        const leaf = section && leafEntries(section.roots()).find((candidate) => candidate.id === reference.entryId);
        if (leaf) {
          resolved.push({
            reference,
            label: leaf.label,
            icon: leaf.icon,
            selection: leaf.selection,
            copy: copyForLeaf(leaf, reference.section),
          });
        }
        continue;
      }
      const view = workspace.workspace.views[reference.viewId];
      const copy = copyForWorkspaceView(workspace.workspace, reference.viewId);
      if (view && copy) {
        resolved.push({ reference, label: view.name, selection: { type: "view", id: view.id }, copy });
      }
    }
    return resolved;
  }, []);
  const recentEntries = () => resolvedRecent() ?? [];

  return (
    <nav class={styles.navigation} aria-label="Application navigation">
      <section
        class={styles.section}
        classList={{ [styles.workspaceDropTarget]: workspaceDropActive() }}
        onDragEnter={(event) => {
          if (event.dataTransfer?.types.includes(workspaceEntryMimeType)) setWorkspaceDropActive(true);
        }}
        onDragOver={(event) => {
          if (!event.dataTransfer?.types.includes(workspaceEntryMimeType)) return;
          event.preventDefault();
          if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setWorkspaceDropActive(false);
        }}
        onDrop={(event) => {
          setWorkspaceDropActive(false);
          if (event.defaultPrevented) return;
          event.preventDefault();
          const draft = readWorkspaceCopy(event);
          if (draft) workspace.copyEntry(draft);
        }}
      >
        <div class={styles.heading}>
          <span class={styles.headingLabel}>My workspace</span>
          <span class={styles.commands}>
            <IconButton
              label="Create folder"
              icon={<FolderIcon size={15} />}
              onClick={() => workspace.createFolder()}
            />
            <IconButton label="Create view" icon={<PlusIcon size={15} />} onClick={() => workspace.createView()} />
          </span>
        </div>
        <div class={styles.panel}>
          <SavedViewNavigation embedded />
        </div>
      </section>
      <section class={styles.section}>
        <button
          class={styles.heading}
          aria-expanded={recentOpen()}
          aria-controls="recently-used-navigation"
          onClick={toggleRecent}
        >
          <Dynamic component={recentOpen() ? ChevronDownIcon : ChevronRightIcon} size={15} aria-hidden="true" />
          <span class={styles.headingLabel}>Recently used</span>
        </button>
        <Show when={recentOpen()}>
          <div id="recently-used-navigation" class={styles.panel}>
            <Show when={recentEntries().length} fallback={<p class={styles.empty}>No recently used views</p>}>
              <RecentTree
                entries={recentEntries()}
                activeRoute={workspace.navigation.activeRoute()}
                onActivate={navigate}
                onRemove={(reference) => {
                  const next = recent().filter((candidate) => JSON.stringify(candidate) !== JSON.stringify(reference));
                  setRecent(next);
                  localStorage.setItem(recentKey, JSON.stringify(next));
                }}
              />
            </Show>
          </div>
        </Show>
      </section>
      <For each={sections}>
        {(section) => {
          const open = () => openSystem() === section.id;
          return (
            <section class={styles.section}>
              <button
                class={styles.heading}
                aria-expanded={open()}
                aria-controls={`system-navigation-${section.id}`}
                onClick={() => setSystemOpen(open() ? undefined : section.id)}
              >
                <Dynamic component={open() ? ChevronDownIcon : ChevronRightIcon} size={15} aria-hidden="true" />
                <span class={styles.headingLabel}>{section.label}</span>
              </button>
              <Show when={open()}>
                <div id={`system-navigation-${section.id}`} class={styles.panel}>
                  <SystemTree
                    roots={section.roots()}
                    sectionId={section.id}
                    activeRoute={workspace.navigation.activeRoute()}
                    onActivate={navigate}
                    openContextMenu={(event, leaf) => {
                      const copy = copyForLeaf(leaf, section.id);
                      contextMenu.open({
                        event,
                        createGroups: () => [
                          {
                            id: contextMenuGroupId("workspace"),
                            entries: [
                              {
                                id: contextMenuEntryId("copy-to-workspace"),
                                label: "Copy to My workspace",
                                description: `Create an editable copy of ${leaf.label}.`,
                                icon: () => <PlusIcon size={14} />,
                                execute: () => {
                                  workspace.copyEntry(copy);
                                },
                              },
                            ],
                          },
                        ],
                      });
                    }}
                  />
                </div>
              </Show>
            </section>
          );
        }}
      </For>
    </nav>
  );
}

function SystemTree(props: {
  roots: readonly NavigationRootContribution[];
  sectionId: string;
  activeRoute?: NavigationRoute;
  onActivate: (selection: NavigationSelection, route: NavigationRoute) => void;
  openContextMenu: (event: MouseEvent, leaf: NavigationLeafContribution) => void;
}) {
  const entries = new Map<NavigationEntryId, NavigationRootContribution>();
  const nodes: ReturnType<typeof defineTreeNode>[] = [];
  const visit = (entry: NavigationRootContribution) => {
    entries.set(entry.id, entry);
    nodes.push(
      entry.type === "folder"
        ? defineTreeFolder({
            id: entry.id,
            children: entry.children.map((child) => child.id),
            data: { label: entry.label },
          })
        : defineTreeNode({ id: entry.id, kind: systemLeafKind, data: { label: entry.label } }),
    );
    if (entry.type === "folder") entry.children.forEach(visit);
  };
  props.roots.forEach(visit);
  const model = defineTreeModel({ roots: props.roots.map((root) => root.id), nodes });
  const entryFor = (node: TreeNode) => entries.get(node.id as unknown as NavigationEntryId)!;
  const label = (node: TreeNode) => entryFor(node).label;
  const renderers = createTreeRendererRegistry(label)
    .replace(folderTreeNodeKind, (node, context) => {
      const entry = entryFor(node);
      return (
        <>
          <Dynamic
            component={entry.icon ?? (context.expanded ? FolderOpenIcon : FolderIcon)}
            class={styles.leafIcon}
            size={16}
            aria-hidden="true"
          />
          <span>{entry.label}</span>
        </>
      );
    })
    .register(systemLeafKind, (node) => {
      const leaf = entryFor(node) as NavigationLeafContribution;
      return (
        <>
          <Show when={leaf.icon}>
            {(icon) => <Dynamic component={icon()} class={styles.leafIcon} size={16} aria-hidden="true" />}
          </Show>
          <span>{leaf.label}</span>
        </>
      );
    })
    .build();
  const definition: TreeDefinition = {
    renderers,
    isSelected: (node) =>
      props.activeRoute?.source === "system" &&
      props.activeRoute.section === props.sectionId &&
      props.activeRoute.id === node.id,
    onActivate: (node) => {
      const entry = entryFor(node);
      if (entry.type === "leaf") {
        props.onActivate(entry.selection, { source: "system", section: props.sectionId, id: entry.id });
      }
    },
    onContextMenu: (event, node) => {
      const entry = entryFor(node);
      if (entry.type === "leaf") props.openContextMenu(event, entry);
    },
    onDragStart: (event, node) => {
      const entry = entryFor(node);
      if (entry.type === "leaf") writeWorkspaceCopy(event, copyForLeaf(entry, props.sectionId));
    },
    canDrag: (node) => entryFor(node).type === "leaf",
  };
  return <Tree ariaLabel="System views" model={model} definition={definition} defaultExpanded={new Set(model.roots)} />;
}

function RecentTree(props: {
  entries: readonly {
    reference: RecentViewReference;
    label: string;
    icon?: NavigationLeafContribution["icon"];
    selection: NavigationSelection;
    copy: WorkspaceEntryDraft;
  }[];
  activeRoute?: NavigationRoute;
  onActivate: (selection: NavigationSelection, route: NavigationRoute) => void;
  onRemove: (reference: RecentViewReference) => void;
}) {
  const contextMenu = useContextMenu();
  const workspace = useWorkspace();
  const byId = new Map(props.entries.map((entry, index) => [`recent-${index}`, entry]));
  const model: TreeModel = defineTreeModel({
    roots: [...byId.keys()],
    nodes: [...byId.keys()].map((id) => defineTreeNode({ id, kind: recentLeafKind })),
  });
  const entryFor = (node: TreeNode) => byId.get(node.id)!;
  const renderers = createTreeRendererRegistry(() => "")
    .register(recentLeafKind, (node) => (
      <>
        <Show when={entryFor(node).icon}>
          {(icon) => <Dynamic component={icon()} class={styles.leafIcon} size={16} aria-hidden="true" />}
        </Show>
        <span>{entryFor(node).label}</span>
      </>
    ))
    .build();
  return (
    <Tree
      ariaLabel="Recently used views"
      model={model}
      definition={{
        renderers,
        isSelected: (node) => {
          const reference = entryFor(node).reference;
          const section = reference.type === "system" ? reference.section : "workspace";
          const id = reference.type === "system" ? reference.entryId : reference.viewId;
          return (
            props.activeRoute?.source === "recent" &&
            props.activeRoute.section === section &&
            props.activeRoute.id === id
          );
        },
        onActivate: (node) => {
          const entry = entryFor(node);
          const section = entry.reference.type === "system" ? entry.reference.section : "workspace";
          const id = entry.reference.type === "system" ? entry.reference.entryId : entry.reference.viewId;
          props.onActivate(entry.selection, { source: "recent", section, id });
        },
        onContextMenu: (event, node) =>
          contextMenu.open({
            event,
            createGroups: () => [
              {
                id: contextMenuGroupId("recent"),
                entries: [
                  {
                    id: contextMenuEntryId("copy-to-workspace"),
                    label: "Copy to My workspace",
                    description: `Create a copy of ${entryFor(node).label}.`,
                    icon: () => <PlusIcon size={14} />,
                    execute: () => {
                      workspace.copyEntry(entryFor(node).copy);
                    },
                  },
                  {
                    id: contextMenuEntryId("remove-recent"),
                    label: "Remove from recently used",
                    description: `Remove ${entryFor(node).label} from this list.`,
                    icon: () => <ListMinusIcon size={14} />,
                    execute: () => props.onRemove(entryFor(node).reference),
                  },
                ],
              },
            ],
          }),
        onDragStart: (event, node) => writeWorkspaceCopy(event, entryFor(node).copy),
      }}
    />
  );
}

function loadRecent(key: string): RecentViewReference[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) ?? "[]");
    return Array.isArray(value) ? (value.slice(0, 8) as RecentViewReference[]) : [];
  } catch {
    return [];
  }
}
