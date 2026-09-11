import { describe, expect, it } from "vitest";

import {
  defineTreeFolder,
  defineTreeModel,
  defineTreeNode,
  folderTreeNodeKind,
  type TreeModel,
  treeNodeId,
  treeNodeKind,
  validateTreeModel,
} from "./tree-model";
import { visibleTreeNodes } from "./visible-tree";

const itemKind = treeNodeKind("item");
const root = treeNodeId("root");
const child = treeNodeId("child");

function validModel(): TreeModel {
  return {
    roots: [root],
    nodes: new Map([
      [root, { id: root, kind: folderTreeNodeKind, data: { label: "Root" }, children: [child] }],
      [child, { id: child, kind: itemKind, data: { label: "Child" } }],
    ]),
  };
}

describe("tree model", () => {
  it("builds a normalized model from concise node definitions", () => {
    const model = defineTreeModel({
      roots: ["root"],
      nodes: [
        defineTreeFolder({ id: "root", children: ["child"], data: { label: "Root" } }),
        defineTreeNode({ id: "child", kind: itemKind }),
      ],
    });

    expect(model.roots).toEqual([root]);
    expect(model.nodes.get(root)).toMatchObject({ kind: folderTreeNodeKind, children: [child] });
    expect(model.nodes.get(child)?.data).toEqual({});
  });

  it("rejects duplicate node definitions while building a model", () => {
    const node = defineTreeNode({ id: "child", kind: itemKind });
    expect(() => defineTreeModel({ roots: ["child"], nodes: [node, node] })).toThrow(/defined more than once/);
  });

  it("requires the dedicated folder helper for the built-in kind", () => {
    expect(() => defineTreeNode({ id: "folder", kind: folderTreeNodeKind })).toThrow(/defineTreeFolder/);
  });

  it("validates a normalized tree and flattens only expanded branches", () => {
    const model = validModel();
    expect(() => validateTreeModel(model)).not.toThrow();
    expect(visibleTreeNodes(model, new Set()).map(({ node }) => node.id)).toEqual([root]);
    expect(visibleTreeNodes(model, new Set([root]))).toMatchObject([
      { node: { id: root }, level: 0 },
      { node: { id: child }, level: 1, parentId: root },
    ]);
  });

  it.each([
    ["missing references", { roots: [treeNodeId("missing")], nodes: new Map() }, /missing node/],
    ["duplicate placement", { ...validModel(), roots: [root, child] }, /placed more than once/],
    [
      "self references",
      {
        roots: [root],
        nodes: new Map([[root, { id: root, kind: folderTreeNodeKind, data: {}, children: [root] }]]),
      },
      /cannot contain itself/,
    ],
    [
      "cycles",
      {
        roots: [],
        nodes: new Map([
          [root, { id: root, kind: folderTreeNodeKind, data: {}, children: [child] }],
          [child, { id: child, kind: folderTreeNodeKind, data: {}, children: [root] }],
        ]),
      },
      /cycle|unreachable/,
    ],
    [
      "unreachable nodes",
      { ...validModel(), roots: [], nodes: new Map([[child, { id: child, kind: itemKind, data: {} }]]) },
      /unreachable/,
    ],
    [
      "folder nodes without children",
      { roots: [root], nodes: new Map([[root, { id: root, kind: folderTreeNodeKind, data: {} }]]) },
      /must define children/,
    ],
    [
      "leaf nodes with children",
      { roots: [root], nodes: new Map([[root, { id: root, kind: itemKind, data: {}, children: [] }]]) },
      /must not define children/,
    ],
  ])("rejects %s", (_name, model, error) => {
    expect(() => validateTreeModel(model as TreeModel)).toThrow(error as RegExp);
  });
});
