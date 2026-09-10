import FolderIcon from "lucide-solid/icons/folder";
import { For, Show } from "solid-js";
import { Dynamic } from "solid-js/web";
import { useEntityRegistry } from "../entities/entity-registry";
import { useWorkspace } from "./controller";
import type { NavigationId } from "./model";
import { useContextMenu } from "../../../components/context-menu/ContextMenuProvider";
import { contextMenuEntryId, contextMenuGroupId } from "../../../components/context-menu/context-menu";
import { IconButton } from "../../../components/IconButton";
import styles from "./SavedViewNavigation.module.css";

function TreeItem(props: { id: NavigationId; level: number }) {
  const controller = useWorkspace();
  const contextMenu = useContextMenu();
  const entities = useEntityRegistry();
  const item = () => controller.workspace.navigation[props.id];
  const folder = () => {
    const current = item();
    return current?.type === "folder" ? current : undefined;
  };
  const viewItem = () => {
    const current = item();
    return current?.type === "view" ? current : undefined;
  };
  const view = () => {
    const current = viewItem();
    return current ? controller.workspace.views[current.viewId] : undefined;
  };
  const entity = () => {
    const current = view();
    const query = current ? controller.workspace.queries[current.queryId] : undefined;
    return query ? entities.require(query.entityId) : undefined;
  };
  const label = () => folder()?.name ?? view()?.name ?? "Missing view";
  const expanded = () => controller.expandedFolders().has(props.id);
  const selected = () => {
    const id = view()?.id;
    return id !== undefined && id === controller.navigation.selectedViewId();
  };
  const openContextMenu = (event: MouseEvent) => {
    contextMenu.open({
      event,
      createGroups: () => {
        const currentFolder = folder();
        const currentView = viewItem();
        return [
          {
            id: contextMenuGroupId("create"),
            entries: currentFolder
              ? [
                  {
                    id: contextMenuEntryId("new-view"),
                    label: "New view",
                    description: `Create a view in ${label()}.`,
                    icon: () => <span>+</span>,
                    execute: () => controller.createView(props.id),
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
                description: `Rename ${label()}.`,
                icon: () => <span>✎</span>,
                execute: () => controller.renameItem(props.id),
              },
              ...(currentView
                ? [
                    {
                      id: contextMenuEntryId("favorite"),
                      label: controller.workspace.favorites.includes(currentView.viewId)
                        ? "Remove from favorites"
                        : "Add to favorites",
                      description: "Toggle this view in the Favorites section.",
                      icon: () => <span>★</span>,
                      execute: () => controller.toggleFavorite(currentView.viewId),
                    },
                    {
                      id: contextMenuEntryId("duplicate"),
                      label: "Duplicate",
                      description: `Create a copy of ${label()}.`,
                      icon: () => <span>□</span>,
                      execute: () => controller.duplicate(currentView.viewId),
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
                execute: () => controller.move(props.id, -1),
              },
              {
                id: contextMenuEntryId("move-down"),
                label: "Move down",
                description: "Move this entry one position down.",
                icon: () => <span>↓</span>,
                execute: () => controller.move(props.id, 1),
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
                execute: () => controller.moveToFolder(props.id, undefined),
              },
              ...Object.values(controller.workspace.navigation)
                .filter((candidate) => candidate.type === "folder" && candidate.id !== props.id)
                .map((candidate) => ({
                  id: contextMenuEntryId(`move-to-${candidate.id}`),
                  label: candidate.type === "folder" ? candidate.name : "",
                  description: `Move this entry to ${candidate.type === "folder" ? candidate.name : "the folder"}.`,
                  icon: () => <FolderIcon size={14} />,
                  execute: () => controller.moveToFolder(props.id, candidate.id),
                })),
            ],
          },
          {
            id: contextMenuGroupId("danger"),
            entries: [
              {
                id: contextMenuEntryId("delete"),
                label: "Delete",
                description: `Delete ${label()}.`,
                icon: () => <span>×</span>,
                execute: () => controller.remove(props.id),
              },
            ],
          },
        ];
      },
    });
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (folder() && event.key === "ArrowRight" && !expanded()) controller.toggleFolder(props.id);
    if (folder() && event.key === "ArrowLeft" && expanded()) controller.toggleFolder(props.id);
    const currentView = viewItem();
    if (currentView && event.key === "Enter") {
      controller.selectView(currentView.viewId);
    }
    const rows = [...document.querySelectorAll<HTMLButtonElement>(`.${styles.treeLabel}`)];
    const index = rows.indexOf(event.currentTarget as HTMLButtonElement);
    const target =
      event.key === "ArrowDown"
        ? rows[index + 1]
        : event.key === "ArrowUp"
          ? rows[index - 1]
          : event.key === "Home"
            ? rows[0]
            : event.key === "End"
              ? rows.at(-1)
              : undefined;
    if (target) {
      event.preventDefault();
      target.focus();
    }
  };

  return (
    <li role="treeitem" aria-expanded={folder() ? expanded() : undefined}>
      <div
        class={`${styles.treeRow} ${selected() ? styles.treeRowSelected : ""}`}
        style={{ "padding-left": `${8 + props.level * 16}px` }}
        onContextMenu={openContextMenu}
      >
        <button
          class={styles.treeLabel}
          onClick={() => {
            const current = viewItem();
            if (folder()) controller.toggleFolder(props.id);
            else if (current) {
              controller.selectView(current.viewId);
            }
          }}
          onKeyDown={onKeyDown}
        >
          <Show when={folder()} fallback={<span class={styles.treeSpacer} />}>
            <span class={styles.iconGlyph} aria-hidden="true">
              {expanded() ? "⌄" : "›"}
            </span>
          </Show>
          <Show when={folder()}>
            <FolderIcon class={styles.entityIcon} size={16} aria-hidden="true" />
          </Show>
          <Show when={entity()}>
            {(description) => (
              <Dynamic component={description().icon} class={styles.entityIcon} size={16} aria-hidden="true" />
            )}
          </Show>
          <span>{label()}</span>
        </button>
        <IconButton label={`Commands for ${label()}`} icon="…" onClick={openContextMenu} />
      </div>
      <Show when={folder() && expanded()}>
        <ul role="group">
          <For each={folder()?.children ?? []}>{(child) => <TreeItem id={child} level={props.level + 1} />}</For>
        </ul>
      </Show>
    </li>
  );
}

export function SavedViewNavigation() {
  const controller = useWorkspace();
  const entities = useEntityRegistry();
  const entityForView = (id: string) => {
    const view = controller.workspace.views[id];
    const query = view ? controller.workspace.queries[view.queryId] : undefined;
    return query ? entities.require(query.entityId) : undefined;
  };
  return (
    <section aria-label="Saved views">
      <div class={styles.panelHeading}>
        <h2>Views</h2>
        <div class={styles.headingCommands}>
          <IconButton label="Create folder" icon={<FolderIcon size={17} />} onClick={() => controller.createFolder()} />
          <IconButton label="Create view" icon="+" onClick={() => controller.createView()} />
        </div>
      </div>
      <Show when={controller.workspace.favorites.length}>
        <section class={styles.favorites} aria-labelledby="favorites-heading">
          <h3 id="favorites-heading">Favorites</h3>
          <For each={controller.workspace.favorites}>
            {(id) => (
              <button class={styles.favoriteLink} onClick={() => controller.selectView(id)}>
                <Show when={entityForView(id)}>
                  {(entity) => (
                    <Dynamic component={entity().icon} class={styles.entityIcon} size={16} aria-hidden="true" />
                  )}
                </Show>
                {controller.workspace.views[id]?.name}
              </button>
            )}
          </For>
        </section>
      </Show>
      <ul class={styles.tree} role="tree" aria-label="Saved views">
        <For each={controller.workspace.rootItems}>{(id) => <TreeItem id={id} level={0} />}</For>
      </ul>
    </section>
  );
}
