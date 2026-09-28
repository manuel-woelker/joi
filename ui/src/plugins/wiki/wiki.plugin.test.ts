// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { PluginRegistryBuilder, plugin } from "../../base/plugin-registry";
import { FetchService } from "../../base/services/fetch-service";
import { ModelService, modelServiceKey } from "../core/entities/model-service";
import { entityDisplays } from "../core/entity-pages/contribution";
import { navigationSection } from "../core/navigation/contribution";
import { viewResolvers } from "../core/shell/contribution";
import wikiPlugin from "./wiki.plugin";
import { wikiPageEntityId } from "./wikipage-entity";

describe("wiki plugin", () => {
  it("registers a copyable wiki entry and resolves list, creation and detail views", () => {
    const registry = new PluginRegistryBuilder([{ key: modelServiceKey, value: new ModelService(new FetchService()) }])
      .register(
        plugin({
          name: "host",
          description: "Test host",
          registerExtensionPoints(context) {
            context.registerExtensionPoint({ point: navigationSection });
            context.registerExtensionPoint({ point: viewResolvers });
            context.registerExtensionPoint({ point: entityDisplays });
          },
        }),
      )
      .register(wikiPlugin)
      .build();
    const section = registry.extensions(navigationSection)[0];
    expect(section.label).toBe("Wiki");
    const root = section.roots()[0];
    if (root.type !== "leaf") throw new Error("Expected pages leaf");
    expect(root.label).toBe("Wiki pages");
    expect(root.copyToWorkspace?.()).toMatchObject({
      type: "shortcut",
      shortcut: { selection: { type: "view", id: "wiki-pages" } },
    });
    const resolver = registry.extensions(viewResolvers)[0];
    expect(registry.extensions(entityDisplays)[0].entityType).toBe(wikiPageEntityId);
    expect(resolver.resolve(root.selection)?.name).toBe("Wiki pages");
    const owner = { type: "view" as const, id: "wiki-pages" };
    expect(resolver.resolve(owner)?.section).toBe("Wiki");
    expect(resolver.resolve({ type: "create", owner })?.name).toBe("Wiki pages");
    expect(resolver.resolve({ type: "record", owner, recordId: "page-1" })?.name).toBe("Wiki pages");
    expect(resolver.resolve({ type: "view", id: "unrelated" })).toBeUndefined();
  });
});
