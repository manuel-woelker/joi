// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { createSignal } from "solid-js";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Tree } from "./Tree";
import { createTreeRendererRegistry } from "./tree-definition";
import { folderTreeNodeKind, type TreeModel, treeNodeId, treeNodeKind } from "./tree-model";

const documentKind = treeNodeKind("document");
const folderId = treeNodeId("folder");
const documentId = treeNodeId("document");

function model(): TreeModel {
  return {
    roots: [folderId],
    nodes: new Map([
      [folderId, { id: folderId, kind: folderTreeNodeKind, data: { label: "Guides" }, children: [documentId] }],
      [documentId, { id: documentId, kind: documentKind, data: { label: "Getting started" } }],
    ]),
  };
}

function label(node: { data: Readonly<Record<string, unknown>> }): string {
  return String(node.data.label);
}

afterEach(cleanup);

describe("Tree", () => {
  it("dispatches renderers and opens and closes folders", async () => {
    const renderers = createTreeRendererRegistry(label)
      .register(documentKind, (node) => <span>Document: {label(node)}</span>)
      .build();
    render(() => <Tree ariaLabel="Documentation" model={model()} definition={{ renderers }} />);

    expect(screen.getAllByRole("treeitem")).toHaveLength(1);
    await userEvent.click(screen.getByRole("button", { name: "Open folder" }));
    expect(screen.getByText("Document: Getting started")).toBeTruthy();
    expect(screen.getAllByRole("treeitem")).toHaveLength(2);
    await userEvent.click(screen.getByRole("button", { name: "Close folder" }));
    expect(screen.queryByText("Document: Getting started")).toBeNull();
  });

  it("supports controlled expansion without mutating caller state", async () => {
    const renderers = createTreeRendererRegistry(label)
      .register(documentKind, () => <span>Document</span>)
      .build();
    const changes = vi.fn();
    const initial = new Set([folderId]);
    render(() => (
      <Tree
        ariaLabel="Controlled"
        model={model()}
        definition={{ renderers }}
        expanded={initial}
        onExpandedChange={changes}
      />
    ));

    await userEvent.click(screen.getByRole("button", { name: "Close folder" }));
    expect(changes).toHaveBeenCalledOnce();
    expect(changes.mock.calls[0][0].has(folderId)).toBe(false);
    expect(initial.has(folderId)).toBe(true);
    expect(screen.getByText("Document")).toBeTruthy();
  });

  it("navigates visible rows and activates leaf nodes", async () => {
    const onActivate = vi.fn();
    const renderers = createTreeRendererRegistry(label)
      .register(documentKind, (node) => <span>{label(node)}</span>)
      .build();
    render(() => (
      <Tree
        ariaLabel="Keyboard tree"
        model={model()}
        definition={{ renderers, onActivate }}
        defaultExpanded={new Set([folderId])}
      />
    ));

    const [folder, document] = screen.getAllByRole("treeitem");
    folder.focus();
    await userEvent.keyboard("{ArrowDown}{Enter}");
    expect(globalThis.document.activeElement).toBe(document);
    expect(onActivate).toHaveBeenCalledWith(expect.objectContaining({ id: documentId }));

    await userEvent.keyboard("{ArrowLeft}");
    expect(globalThis.document.activeElement).toBe(folder);
  });

  it("moves focus to a folder when its focused descendant is collapsed", async () => {
    const renderers = createTreeRendererRegistry(label)
      .register(documentKind, (node) => <span>{label(node)}</span>)
      .build();
    render(() => (
      <Tree ariaLabel="Focus tree" model={model()} definition={{ renderers }} defaultExpanded={new Set([folderId])} />
    ));

    const [folder, document] = screen.getAllByRole("treeitem");
    document.focus();
    await userEvent.keyboard("{ArrowLeft}");
    expect(globalThis.document.activeElement).toBe(folder);
    await userEvent.keyboard("{ArrowLeft}");
    expect(screen.getAllByRole("treeitem")).toHaveLength(1);
    expect(globalThis.document.activeElement).toBe(folder);
  });

  it("delegates selection and context menus", () => {
    const onContextMenu = vi.fn();
    const renderers = createTreeRendererRegistry(label)
      .register(documentKind, (node) => <span>{label(node)}</span>)
      .build();
    render(() => (
      <Tree
        ariaLabel="Selected tree"
        model={model()}
        definition={{ renderers, isSelected: (node) => node.id === folderId, onContextMenu }}
      />
    ));

    const folder = screen.getByRole("treeitem");
    expect(folder.getAttribute("aria-selected")).toBe("true");
    fireEvent.contextMenu(folder.firstElementChild as HTMLElement);
    expect(onContextMenu).toHaveBeenCalledWith(expect.any(MouseEvent), expect.objectContaining({ id: folderId }));
  });

  it("delegates optional drag moves using normalized parent and index targets", () => {
    const move = vi.fn();
    const renderers = createTreeRendererRegistry(label)
      .register(documentKind, (node) => <span>{label(node)}</span>)
      .build();
    render(() => (
      <Tree
        ariaLabel="Movable tree"
        model={model()}
        definition={{
          renderers,
          move: { canMove: () => true, canMoveTo: () => true, move },
        }}
        defaultExpanded={new Set([folderId])}
      />
    ));

    const [folder, document] = screen.getAllByRole("treeitem");
    vi.spyOn(folder, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 200,
      bottom: 32,
      width: 200,
      height: 32,
      toJSON: () => undefined,
    });
    fireEvent.dragStart(document);
    fireEvent(folder, new MouseEvent("dragover", { bubbles: true, clientX: 60, clientY: 16 }));
    fireEvent(folder, new MouseEvent("drop", { bubbles: true, clientX: 60, clientY: 16 }));

    expect(move).toHaveBeenCalledWith(expect.objectContaining({ id: documentId }), { parentId: folderId, index: 1 });
  });

  it("copies with a modifier drag when copying is available", () => {
    const move = vi.fn();
    const copy = vi.fn();
    const renderers = createTreeRendererRegistry(label)
      .register(documentKind, (node) => <span>{label(node)}</span>)
      .build();
    render(() => (
      <Tree
        ariaLabel="Copyable movable tree"
        model={model()}
        definition={{ renderers, move: { canMove: () => true, canMoveTo: () => true, move, copy } }}
        defaultExpanded={new Set([folderId])}
      />
    ));

    const [folder, document] = screen.getAllByRole("treeitem");
    vi.spyOn(folder, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 200,
      bottom: 32,
      width: 200,
      height: 32,
      toJSON: () => undefined,
    });
    fireEvent.dragStart(document);
    fireEvent(folder, new MouseEvent("dragover", { bubbles: true, ctrlKey: true, clientX: 60, clientY: 16 }));
    fireEvent(folder, new MouseEvent("drop", { bubbles: true, ctrlKey: true, clientX: 60, clientY: 16 }));

    expect(copy).toHaveBeenCalledOnce();
    expect(move).not.toHaveBeenCalled();
  });

  it("keeps non-collapsible branches visible and styles their complete wrapper", () => {
    const renderers = createTreeRendererRegistry(label)
      .register(documentKind, (node) => <span>{label(node)}</span>)
      .build();
    render(() => (
      <Tree
        ariaLabel="Permanent tree"
        model={model()}
        definition={{ renderers, isCollapsible: () => false, classForNode: () => "permanent-branch" }}
      />
    ));

    expect(screen.queryByRole("button", { name: /folder/i })).toBeNull();
    expect(screen.getByText("Getting started")).toBeTruthy();
    expect(screen.getAllByRole("treeitem")[0].parentElement?.classList.contains("permanent-branch")).toBe(true);
  });

  it("delegates external drag starts only for draggable nodes", () => {
    const onDragStart = vi.fn();
    const renderers = createTreeRendererRegistry(label)
      .register(documentKind, (node) => <span>{label(node)}</span>)
      .build();
    render(() => (
      <Tree
        ariaLabel="Copyable tree"
        model={model()}
        definition={{ renderers, canDrag: (node) => node.kind === documentKind, onDragStart }}
        defaultExpanded={new Set([folderId])}
      />
    ));

    const [folder, document] = screen.getAllByRole("treeitem");
    expect(folder.hasAttribute("draggable")).toBe(false);
    expect(document.getAttribute("draggable")).toBe("true");
    fireEvent.dragStart(document);
    expect(onDragStart).toHaveBeenCalledWith(expect.any(Event), expect.objectContaining({ id: documentId }));
  });

  it("drops external data at the same normalized positions as local moves", () => {
    const drop = vi.fn();
    const renderers = createTreeRendererRegistry(label)
      .register(documentKind, (node) => <span>{label(node)}</span>)
      .build();
    render(() => (
      <Tree
        ariaLabel="Drop target tree"
        model={model()}
        definition={{ renderers, externalDrop: { canDrop: () => true, drop } }}
        defaultExpanded={new Set([folderId])}
      />
    ));

    const document = screen.getAllByRole("treeitem")[1];
    vi.spyOn(document, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 32,
      left: 0,
      top: 32,
      right: 200,
      bottom: 64,
      width: 200,
      height: 32,
      toJSON: () => undefined,
    });
    fireEvent(document, new MouseEvent("dragover", { bubbles: true, clientX: 10, clientY: 33 }));
    fireEvent(document, new MouseEvent("drop", { bubbles: true, clientX: 10, clientY: 33 }));

    expect(drop).toHaveBeenCalledWith(expect.any(Event), { parentId: folderId, index: 0 });
  });

  it("reacts to controlled expansion updates", async () => {
    const renderers = createTreeRendererRegistry(label)
      .register(documentKind, () => <span>Document</span>)
      .build();
    function Scenario() {
      const [expanded, setExpanded] = createSignal<ReadonlySet<typeof folderId>>(new Set());
      return (
        <Tree
          ariaLabel="Reactive tree"
          model={model()}
          definition={{ renderers }}
          expanded={expanded()}
          onExpandedChange={setExpanded}
        />
      );
    }
    render(() => <Scenario />);
    await userEvent.click(screen.getByRole("button", { name: "Open folder" }));
    expect(screen.getByText("Document")).toBeTruthy();
  });

  it("reports missing renderers with the kind", () => {
    const renderers = createTreeRendererRegistry(label).build();
    expect(() => render(() => <Tree ariaLabel="Invalid" model={model()} definition={{ renderers }} />)).toThrow(
      /document.*not registered/,
    );
  });
});
