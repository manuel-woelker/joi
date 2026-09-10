// @vitest-environment happy-dom

import { cleanup, render, screen } from "@solidjs/testing-library";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createApplication, discoveredApplicationPlugins } from "../../../base/application-registry";
import { PluginRegistryBuilder, plugin } from "../../../base/plugin-registry";
import { entityDescriptions } from "../entities/entity-registry";
import { defineEntity, entityId } from "../entities/entity-description";
import entitiesPlugin from "../entities/entities.plugin";
import { savedViewDefaults, savedViewDefaultsContributionId } from "../saved-views/contribution";
import savedViewsPlugin from "../saved-views/saved-views.plugin";
import { createTestWorkspace } from "../saved-views/test-fixtures";
import shellPlugin from "./shell.plugin";
import { navigationSections, shellContributionId, shellOverlays, viewResolvers } from "./contribution";
import { resolveApplicationView } from "./ApplicationShell";
import { ApplicationShell } from "./ApplicationShell";

const ExampleIcon = () => null;

afterEach(cleanup);

describe("dynamic domain plugins", () => {
  it("registers and resolves a second domain without shell changes", () => {
    const milestones = defineEntity({
      id: entityId("test.milestones"),
      tableName: "milestones",
      label: "Milestone",
      pluralLabel: "Milestones",
      icon: ExampleIcon,
      identityAttribute: "id",
      attributes: [{ id: "id", label: "ID", valueType: "string" }],
    });
    const domain = plugin({
      name: "test-milestones",
      description: "Synthetic acceptance-test domain",
      registerExtensions(context) {
        context.registerExtension({
          point: entityDescriptions,
          id: "test-milestone-entity",
          description: "Defines milestones",
          value: milestones,
        });
        context.registerExtension({
          point: navigationSections,
          id: "test-milestone-navigation",
          description: "Adds milestone navigation",
          value: {
            id: shellContributionId("test-milestone-navigation"),
            order: 50,
            component: () => <span>Milestones</span>,
          },
        });
        context.registerExtension({
          point: savedViewDefaults,
          id: "test-milestone-defaults",
          description: "Provides milestone defaults",
          value: {
            id: savedViewDefaultsContributionId("test-milestone-defaults"),
            workspace: createTestWorkspace(),
          },
        });
        context.registerExtension({
          point: shellOverlays,
          id: "test-milestone-editor",
          description: "Adds the milestone editor",
          value: {
            id: shellContributionId("test-milestone-editor"),
            order: 50,
            component: () => <aside>Milestone editor</aside>,
          },
        });
        context.registerExtension({
          point: viewResolvers,
          id: "test-milestone-views",
          description: "Resolves milestone routes",
          value: {
            id: shellContributionId("test-milestone-views"),
            order: 50,
            resolve: (selection) =>
              selection.type === "view" && selection.id === "test.milestones"
                ? {
                    id: "test.milestones",
                    name: "Milestones",
                    section: "Planning",
                    icon: ExampleIcon,
                    content: () => <main>Milestone domain</main>,
                  }
                : undefined,
          },
        });
      },
    });
    const registry = new PluginRegistryBuilder()
      .register(shellPlugin)
      .register(entitiesPlugin)
      .register(savedViewsPlugin)
      .register(domain)
      .build();

    expect(registry.extensions(entityDescriptions)).toEqual([milestones]);
    expect(registry.extensions(navigationSections)[0]?.id).toBe("test-milestone-navigation");
    expect(registry.extensions(savedViewDefaults)[0]?.id).toBe("test-milestone-defaults");
    expect(registry.extensions(shellOverlays)[0]?.id).toBe("test-milestone-editor");
    expect(resolveApplicationView(registry, { type: "view", id: "test.milestones" })?.name).toBe("Milestones");
  });

  it("constructs core UI plugins without the ticket domain", () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    const plugins = discoveredApplicationPlugins().filter(
      (candidate) => !candidate.location?.file.includes("/plugins/ticket/"),
    );
    expect(plugins.some((candidate) => candidate.name === "tickets")).toBe(false);

    const application = createApplication({ plugins });

    expect(application.registry.metadata().plugins.some((candidate) => candidate.name === "administration")).toBe(true);
    expect(application.registry.extensions(entityDescriptions).map((entity) => entity.id)).toEqual(["users"]);

    window.location.hash = "#/not-a-domain-route";
    render(() => (
      <ApplicationShell
        registry={application.registry}
        services={application.services}
        user={{ id: "user-1", username: "jane", name: "Jane Developer" }}
        onLogout={async () => undefined}
      />
    ));
    expect(screen.getByRole("complementary", { name: "Workspace navigation" })).toBeTruthy();
    expect(screen.getByText("Users")).toBeTruthy();
    expect(screen.getByText("No view selected")).toBeTruthy();
  });

  it("rejects ambiguous view resolution", () => {
    const resolver = (id: string) =>
      plugin({
        name: id,
        description: id,
        registerExtensions(context) {
          context.registerExtension({
            point: viewResolvers,
            id,
            description: id,
            value: {
              id: shellContributionId(id),
              order: 0,
              resolve: () => ({ id, name: id, section: "Test", content: () => null }),
            },
          });
        },
      });
    const registry = new PluginRegistryBuilder()
      .register(shellPlugin)
      .register(resolver("first"))
      .register(resolver("second"))
      .build();

    expect(() => resolveApplicationView(registry, { type: "view", id: "anything" })).toThrow("multiple views");
  });
});
