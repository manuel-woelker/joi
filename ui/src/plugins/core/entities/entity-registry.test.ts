import { describe, expect, it } from "vitest";

import { EntityRegistry, entityDescriptions } from "./entity-registry";
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
    expect(() => entityDescriptions.validate?.([testEntity, testEntity])).toThrow(
      "Entity 'things' is registered more than once",
    );
  });
});
