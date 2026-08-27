import { describe, expect, it } from "vitest";

import { PluginRegistryBuilder, extensionPoint, plugin } from "./registry";

describe("PluginRegistryBuilder", () => {
  it("registers typed extensions in order", () => {
    const commands = extensionPoint<() => string>("commands", "Adds commands");
    const registry = new PluginRegistryBuilder()
      .register(plugin("core", "Core points", (context) => context.registerExtensionPoint(commands)))
      .register(plugin("commands", "Commands", (context) => {
        context.registerExtension(commands, "first", "First command", () => "first");
        context.registerExtension(commands, "second", "Second command", () => "second");
      }))
      .build();

    expect(registry.extensions(commands).map((command) => command())).toEqual(["first", "second"]);
  });

  it("rolls back a failed plugin registration", () => {
    const commands = extensionPoint<string>("commands", "Adds commands");
    const builder = new PluginRegistryBuilder()
      .register(plugin("core", "Core points", (context) => context.registerExtensionPoint(commands)));

    expect(() => builder.register(plugin("broken", "Broken plugin", (context) => {
      context.registerExtension(commands, "duplicate", "First", "first");
      context.registerExtension(commands, "duplicate", "Second", "second");
    }))).toThrow("already registered");

    expect(builder.build().extensions(commands)).toEqual([]);
    expect(() => builder.register(plugin("broken", "Retry", (context) => {
      context.registerExtension(commands, "working", "Working", "working");
    }))).not.toThrow();
  });
});
