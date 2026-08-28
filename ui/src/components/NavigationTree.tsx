import { For, Show, createSignal } from "solid-js";

import type { NavigationId } from "../workspace/model";
import { useWorkspace } from "../workspace/controller";
import { IconButton } from "./IconButton";

function TreeItem(props: { id: NavigationId; level: number }) {
  const controller = useWorkspace();
  const item = () => controller.workspace.navigation[props.id];
  const [menuOpen, setMenuOpen] = createSignal(false);
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
  const label = () => folder()?.name ?? view()?.name ?? "Missing view";
  const expanded = () => controller.expandedFolders().has(props.id);

  const onKeyDown = (event: KeyboardEvent) => {
    if (folder() && event.key === "ArrowRight" && !expanded()) controller.toggleFolder(props.id);
    if (folder() && event.key === "ArrowLeft" && expanded()) controller.toggleFolder(props.id);
    const currentView = viewItem();
    if (currentView && event.key === "Enter") controller.selectView(currentView.viewId);
    const rows = [...document.querySelectorAll<HTMLButtonElement>(".tree-label")];
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
        class={`tree-row ${view()?.id === controller.selectedViewId() ? "selected" : ""}`}
        style={{ "padding-left": `${8 + props.level * 16}px` }}
      >
        <button
          class="tree-label"
          onClick={() => {
            const current = viewItem();
            folder() ? controller.toggleFolder(props.id) : current && controller.selectView(current.viewId);
          }}
          onKeyDown={onKeyDown}
        >
          <Show when={folder()} fallback={<span class="tree-spacer" />}>
            <span class="icon-glyph" aria-hidden="true">
              {expanded() ? "⌄" : "›"}
            </span>
          </Show>
          <Show when={folder()}>
            <span class="icon-glyph" aria-hidden="true">
              □
            </span>
          </Show>
          <span>{label()}</span>
        </button>
        <IconButton label={`Commands for ${label()}`} icon="…" onClick={() => setMenuOpen(!menuOpen())} />
        <Show when={menuOpen()}>
          <div class="item-menu">
            <Show when={folder()}>
              <button
                onClick={() => {
                  controller.createView(props.id);
                  setMenuOpen(false);
                }}
              >
                <span aria-hidden="true">+</span> New view
              </button>
            </Show>
            <button
              onClick={() => {
                controller.renameItem(props.id);
                setMenuOpen(false);
              }}
            >
              <span aria-hidden="true">✎</span> Rename
            </button>
            <Show when={viewItem()}>
              {(current) => (
                <>
                  <button onClick={() => controller.toggleFavorite(current().viewId)}>
                    <span aria-hidden="true">★</span> Favorite
                  </button>
                  <button onClick={() => controller.duplicate(current().viewId)}>
                    <span aria-hidden="true">□</span> Duplicate
                  </button>
                </>
              )}
            </Show>
            <button onClick={() => controller.move(props.id, -1)}>
              <span aria-hidden="true">↑</span> Move up
            </button>
            <button onClick={() => controller.move(props.id, 1)}>
              <span aria-hidden="true">↓</span> Move down
            </button>
            <label class="move-label">
              Move to
              <select
                aria-label={`Move ${label()} to folder`}
                onChange={(event) => {
                  controller.moveToFolder(props.id, event.currentTarget.value || undefined);
                  setMenuOpen(false);
                }}
              >
                <option value="">Root</option>
                <For
                  each={Object.values(controller.workspace.navigation).filter(
                    (candidate) => candidate.type === "folder" && candidate.id !== props.id,
                  )}
                >
                  {(candidate) => (
                    <option value={candidate.id}>{candidate.type === "folder" ? candidate.name : ""}</option>
                  )}
                </For>
              </select>
            </label>
            <button
              class="danger"
              onClick={() => {
                controller.remove(props.id);
                setMenuOpen(false);
              }}
            >
              <span aria-hidden="true">×</span> Delete
            </button>
          </div>
        </Show>
      </div>
      <Show when={folder() && expanded()}>
        <ul role="group">
          <For each={folder()?.children ?? []}>{(child) => <TreeItem id={child} level={props.level + 1} />}</For>
        </ul>
      </Show>
    </li>
  );
}

export function NavigationTree() {
  const controller = useWorkspace();
  const startResize = (event: PointerEvent) => {
    const origin = event.clientX;
    const width = controller.sidebarWidth();
    const move = (moveEvent: PointerEvent) => controller.setSidebarWidth(width + moveEvent.clientX - origin);
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
  };
  return (
    <aside class={`navigation-panel ${controller.navigationOpen() ? "open" : ""}`} aria-label="Workspace navigation">
      <div class="panel-heading">
        <h2>Views</h2>
        <div class="heading-actions">
          <IconButton label="Create folder" icon="□+" onClick={() => controller.createFolder()} />
          <IconButton label="Create view" icon="+" onClick={() => controller.createView()} />
        </div>
      </div>
      <Show when={controller.workspace.favorites.length}>
        <section class="favorites" aria-labelledby="favorites-heading">
          <h3 id="favorites-heading">Favorites</h3>
          <For each={controller.workspace.favorites}>
            {(id) => (
              <button class="favorite-link" onClick={() => controller.selectView(id)}>
                <span aria-hidden="true">★</span>
                {controller.workspace.views[id]?.name}
              </button>
            )}
          </For>
        </section>
      </Show>
      <ul class="tree" role="tree" aria-label="Saved views">
        <For each={controller.workspace.rootItems}>{(id) => <TreeItem id={id} level={0} />}</For>
      </ul>
      <button
        class="sidebar-resizer"
        aria-label="Resize navigation"
        aria-orientation="vertical"
        onPointerDown={startResize}
      />
    </aside>
  );
}
