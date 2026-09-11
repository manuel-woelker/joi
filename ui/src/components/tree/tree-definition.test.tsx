import { describe, expect, it } from "vitest";

import { TreeRendererRegistryBuilder } from "./tree-definition";
import { treeNodeKind } from "./tree-model";

describe("TreeRendererRegistryBuilder", () => {
  it("preserves registrations in an immutable snapshot", () => {
    const first = treeNodeKind("first");
    const second = treeNodeKind("second");
    const builder = new TreeRendererRegistryBuilder().register(first, () => <span>First</span>);
    const snapshot = builder.build();
    builder.register(second, () => <span>Second</span>);

    expect([...snapshot.keys()]).toEqual([first]);
  });

  it("rejects duplicate renderer registrations", () => {
    const kind = treeNodeKind("entry");
    const builder = new TreeRendererRegistryBuilder().register(kind, () => <span>Entry</span>);
    expect(() => builder.register(kind, () => <span>Duplicate</span>)).toThrow(/already registered/);
  });

  it("allows an existing renderer to be explicitly replaced", () => {
    const kind = treeNodeKind("entry");
    const replacement = () => <span>Replacement</span>;
    const registry = new TreeRendererRegistryBuilder()
      .register(kind, () => <span>Original</span>)
      .replace(kind, replacement)
      .build();

    expect(registry.get(kind)).toBe(replacement);
    expect(() => new TreeRendererRegistryBuilder().replace(kind, replacement)).toThrow(/not registered/);
  });
});
