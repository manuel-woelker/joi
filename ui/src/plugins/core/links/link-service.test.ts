import { describe, expect, it, vi } from "vitest";
import { PluginRegistryBuilder, plugin } from "../../../base/plugin-registry";
import { LinkService } from "./link-service";
import { linkTargetProviders, type LinkTargetProvider } from "./link-targets";

function service(...providers: LinkTargetProvider[]) {
  const registry = new PluginRegistryBuilder()
    .register(
      plugin({
        name: "test-links",
        description: "Test link providers",
        registerExtensionPoints(context) {
          context.registerExtensionPoint({ point: linkTargetProviders });
        },
        registerExtensions(context) {
          providers.forEach((value, index) =>
            context.registerExtension({
              point: linkTargetProviders,
              id: `provider-${index}`,
              description: value.label,
              value,
            }),
          );
        },
      }),
    )
    .build();
  return new LinkService(registry);
}

const provider = (type: string): LinkTargetProvider => ({
  type,
  label: type,
  resolve: vi.fn(async (keys: readonly string[]) =>
    keys.map((key) => ({ reference: `${type}:${key}`, label: key, href: `#:wiki:${key}` })),
  ),
  search: vi.fn(async (query) => [{ reference: `${type}:${query}`, label: query, href: `#:wiki:${query}` }]),
});

describe("LinkService", () => {
  it("groups resolution by provider and caches successful targets", async () => {
    const wiki = provider("wiki");
    const ticket = provider("ticket");
    const links = service(wiki, ticket);
    const signal = new AbortController().signal;
    expect(
      (await links.resolve(["wiki:Start", "ticket:TEST-1", "wiki:Other"], signal)).map((item) => item?.label),
    ).toEqual(["Start", "TEST-1", "Other"]);
    expect(wiki.resolve).toHaveBeenCalledTimes(1);
    await links.resolve(["wiki:Start"], signal);
    expect(wiki.resolve).toHaveBeenCalledTimes(1);
    links.invalidate();
    await links.resolve(["wiki:Start"], signal);
    expect(wiki.resolve).toHaveBeenCalledTimes(2);
  });

  it("narrows typed searches and rejects duplicate types", async () => {
    const wiki = provider("wiki");
    const ticket = provider("ticket");
    const links = service(wiki, ticket);
    expect((await links.search("wiki:Start", new AbortController().signal)).entries).toHaveLength(1);
    expect(ticket.search).not.toHaveBeenCalled();
    expect(() => service(wiki, provider("wiki"))).toThrow("registered twice");
  });

  it("returns healthy providers when another search fails", async () => {
    const broken = {
      ...provider("wiki"),
      search: async () => {
        throw new Error("Wiki unavailable");
      },
    };
    const result = await service(broken, provider("ticket")).search("Start", new AbortController().signal);
    expect(result.entries.map((entry) => entry.reference)).toEqual(["ticket:Start"]);
    expect(result.errors).toEqual(["wiki: Wiki unavailable"]);
  });

  it("reports partial results and times out a stalled provider", async () => {
    vi.useFakeTimers();
    try {
      const stalled = { ...provider("ticket"), search: async (): Promise<never> => new Promise(() => undefined) };
      const updates: string[][] = [];
      const pending = service(provider("wiki"), stalled).search("Start", new AbortController().signal, (result) => {
        updates.push(result.entries.map((entry) => entry.reference));
      });
      await vi.advanceTimersByTimeAsync(1);
      expect(updates).toContainEqual(["wiki:Start"]);
      await vi.advanceTimersByTimeAsync(5_000);
      const result = await pending;
      expect(result.entries.map((entry) => entry.reference)).toEqual(["wiki:Start"]);
      expect(result.errors).toEqual(["ticket: Search timed out"]);
    } finally {
      vi.useRealTimers();
    }
  });
});
