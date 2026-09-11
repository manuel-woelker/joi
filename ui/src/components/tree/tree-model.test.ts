import { describe, expect, it } from "vitest";

import { folderTreeNodeKind, type TreeModel, treeNodeId, treeNodeKind, validateTreeModel } from "./tree-model";
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
