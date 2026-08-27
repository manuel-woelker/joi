import { describe, expect, it } from "vitest";

import { PluginRegistryBuilder, extensionPoint, plugin } from "./registry";
import { serviceKey } from "./services";

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

  it("initializes service providers before consumers", () => {
    const base = serviceKey<string>("base");
    const derived = serviceKey<number>("derived");
    const initialized: string[] = [];
    const builder = new PluginRegistryBuilder()
      .register(plugin({
        name: "consumer",
        description: "Consumes base",
        requires: { base },
        provides: { derived },
        initialize({ base }) {
          initialized.push("consumer");
          return { derived: base.length };
        },
      }))
      .register(plugin({
        name: "provider",
        description: "Provides base",
        provides: { base },
        initialize() {
          initialized.push("provider");
          return { base: "ready" };
        },
      }));

    builder.build();
    expect(initialized).toEqual(["provider", "consumer"]);
  });

  it("detects service dependency cycles", () => {
    const first = serviceKey<string>("first");
    const second = serviceKey<string>("second");
    const builder = new PluginRegistryBuilder()
      .register(plugin({
        name: "first-plugin",
        description: "First",
        requires: { second },
        provides: { first },
        initialize: () => ({ first: "first" }),
      }))
      .register(plugin({
        name: "second-plugin",
        description: "Second",
        requires: { first },
        provides: { second },
        initialize: () => ({ second: "second" }),
      }));

    expect(() => builder.build()).toThrow("dependency cycle");
  });

  it("validates promised services at runtime", () => {
    const promised = serviceKey<string>("promised");
    const invalidPlugin = plugin({
      name: "invalid",
      description: "Invalid provider",
      provides: { promised },
      initialize: () => ({ promised: "value" }),
    });
    invalidPlugin.initialize = () => ({});

    expect(() => new PluginRegistryBuilder().register(invalidPlugin).build())
      .toThrow("did not create exactly its declared services");
  });
});
