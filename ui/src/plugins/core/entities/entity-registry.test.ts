import { describe, expect, it } from "vitest";

import { EntityRegistry } from "./entity-registry";
import { testEntity } from "../saved-views/test-fixtures";

describe("EntityRegistry", () => {
  it("resolves registered entities", () => {
    const registry = new EntityRegistry([testEntity]);
    expect(registry.require(testEntity.id)).toBe(testEntity);
  });

  it("reports missing entity IDs", () => {
    const registry = new EntityRegistry([]);
    expect(() => registry.require(testEntity.id)).toThrow("Entity 'things' is not registered");
  });

  it("rejects duplicate entity contributions", () => {
    expect(() => new EntityRegistry([testEntity, testEntity])).toThrow("Duplicate entity IDs");
  });
});
