import { describe, expect, it } from "vitest";

import { PluginRegistryBuilder, extensionPoint, plugin } from "./registry";

describe("PluginRegistryBuilder", () => {
  it("registers all extension points before any extensions", () => {
    const commands = extensionPoint<() => string>("commands", "Adds commands");
    const registry = new PluginRegistryBuilder()
      .register(plugin({
        name: "commands",
        description: "Commands",
        registerExtensions(context) {
          context.registerExtension({
            point: commands,
            id: "first",
            description: "First command",
            value: () => "first",
          });
          context.registerExtension({
            point: commands,
            id: "second",
            description: "Second command",
            value: () => "second",
          });
        },
      }))
      .register(plugin({
        name: "core",
        description: "Core points",
        registerExtensionPoints(context) {
          context.registerExtensionPoint({ point: commands });
        },
      }))
      .build();

    expect(registry.extensions(commands).map((command) => command())).toEqual(["first", "second"]);
    expect(registry.metadata()).toEqual({
      plugins: [
        {
          name: "commands",
          description: "Commands",
          extensionPoints: [],
          extensions: ["first", "second"],
        },
        { name: "core", description: "Core points", extensionPoints: ["commands"], extensions: [] },
      ],
      extensionPoints: [{
        id: "commands",
        description: "Adds commands",
        extensions: ["first", "second"],
      }],
      extensions: [
        { id: "first", description: "First command" },
        { id: "second", description: "Second command" },
      ],
    });
  });

  it("rejects duplicate plugin names before building", () => {
    const builder = new PluginRegistryBuilder()
      .register(plugin({ name: "same", description: "First" }));

    expect(() => builder.register(plugin({ name: "same", description: "Second" })))
      .toThrow("already registered");
  });

  it("does not expose a registry when an extension phase fails", () => {
    const commands = extensionPoint<string>("commands", "Adds commands");
    const builder = new PluginRegistryBuilder()
      .register(plugin({
        name: "core",
        description: "Core points",
        registerExtensionPoints(context) {
          context.registerExtensionPoint({ point: commands });
        },
      }))
      .register(plugin({
        name: "broken",
        description: "Broken plugin",
        registerExtensions(context) {
          context.registerExtension({ point: commands, id: "duplicate", description: "First", value: "first" });
          context.registerExtension({ point: commands, id: "duplicate", description: "Second", value: "second" });
        },
      }));

    expect(() => builder.build()).toThrow("already registered");
  });
});
