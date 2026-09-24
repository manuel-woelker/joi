import { Show } from "solid-js";

import { plugin } from "../../base/plugin-registry";
import { IconButton } from "../../components/IconButton";
import { shellOverlays, topBarContributions, viewResolvers, shellContributionId } from "../core/shell/contribution";
import { EntityMasterDetailView } from "../core/master-detail/EntityMasterDetailView";
import { ViewEditor } from "./saved-views/ViewEditor";
import { ticketEntity } from "./entities/ticket-entity";
import { entityDescriptions } from "../core/entities/entity-registry";
import { savedViewDefaults, savedViewDefaultsContributionId } from "../core/saved-views/contribution";
import { useWorkspace } from "../core/saved-views/controller";
import { createTicketDefaultWorkspace } from "./saved-views/ticket-default-views";
import { navigationEntryId, navigationSection, navigationSectionId } from "../core/navigation/contribution";
import styles from "./TicketShell.module.css";

function TicketTopBarCommands() {
  const controller = useWorkspace();
  return (
    <>
      <Show when={controller.announcement().includes("Undo")}>
        <button class={styles.undoButton} onClick={() => controller.undo()}>
          <span aria-hidden="true">↶</span>Undo
        </button>
      </Show>
      <IconButton label="Reset demo workspace" icon="↻" onClick={() => controller.reset()} />
    </>
  );
}

function TicketOverlays() {
  const controller = useWorkspace();
  return (
    <>
      <ViewEditor />
      <Show when={controller.warning()}>
        <div class={styles.warningBanner} role="alert">
          {controller.warning()}
        </div>
      </Show>
      <div class={styles.srOnly} aria-live="polite">
        {controller.announcement()}
      </div>
    </>
  );
}

function TicketViewCommands() {
  const controller = useWorkspace();
  return <IconButton label="Configure view" icon="⚙" onClick={() => controller.setEditorOpen(true)} />;
}

function TicketMasterDetailView() {
  const controller = useWorkspace();
  const defaults = createTicketDefaultWorkspace();
  const view = () => {
    const route = controller.navigation.activeRoute();
    return route?.section === "tickets" && route.source !== "workspace"
      ? defaults.views[route.id]
      : controller.selectedView();
  };
  const query = () => {
    const current = view();
    const route = controller.navigation.activeRoute();
    return current
      ? route?.section === "tickets" && route.source !== "workspace"
        ? defaults.queries[current.queryId]
        : controller.workspace.queries[current.queryId]
      : undefined;
  };
  return (
    <EntityMasterDetailView
      entityId={ticketEntity.id}
      initialFilter={query()?.filter}
      initialSorting={query()?.sorting.map((sort) => ({ attribute: sort.field, direction: sort.direction }))}
      filterIdentity={controller.navigation.selectedViewId()}
    />
  );
}

export default plugin({
  name: "tickets",
  description: "Ticket domain views and workspace",
  registerExtensions(context) {
    context.registerExtension({
      point: entityDescriptions,
      id: "ticket-entity",
      description: "Defines ticket records",
      value: ticketEntity,
    });
    context.registerExtension({
      point: savedViewDefaults,
      id: "ticket-default-views",
      description: "Provides default ticket views",
      value: { id: savedViewDefaultsContributionId("ticket-default-views"), workspace: createTicketDefaultWorkspace() },
    });
    context.registerExtension({
      point: navigationSection,
      id: "ticket-navigation",
      description: "Displays saved ticket views",
      value: {
        id: navigationSectionId("tickets"),
        label: "Tickets",
        order: 0,
        roots: () => {
          const defaults = createTicketDefaultWorkspace();
          const leaf = (entryId: string, viewId: string) => {
            const view = defaults.views[viewId];
            const query = defaults.queries[view.queryId];
            const presentation = defaults.presentations[view.presentationId];
            return {
              id: navigationEntryId(entryId),
              type: "leaf" as const,
              label: view.name,
              description: view.description,
              icon: ticketEntity.icon,
              selection: { type: "view" as const, id: `system:tickets:${viewId}` },
              copyToWorkspace: () => ({
                type: "view" as const,
                view: {
                  name: view.name,
                  description: view.description,
                  query: { name: query.name, entityId: query.entityId, filter: query.filter, sorting: query.sorting },
                  presentation: {
                    name: presentation.name,
                    entityId: presentation.entityId,
                    layout: presentation.layout,
                    density: presentation.density,
                    fields: presentation.fields,
                  },
                  sourceNavigationEntryId: `tickets/${entryId}`,
                  sourceViewId: `system:tickets:${viewId}`,
                },
              }),
            };
          };
          return [
            {
              id: navigationEntryId("ticket-work"),
              type: "folder" as const,
              label: "Work",
              children: [leaf("view-active", "view-active"), leaf("view-closed", "view-closed")],
            },
            {
              id: navigationEntryId("ticket-reference"),
              type: "folder" as const,
              label: "Reference",
              children: [leaf("view-all", "view-all")],
            },
          ];
        },
      },
    });
    context.registerExtension({
      point: viewResolvers,
      id: "ticket-views",
      description: "Resolves saved ticket views",
      value: {
        id: shellContributionId("ticket-views"),
        order: 0,
        resolve(selection) {
          const controller = useWorkspace();
          const owner = selection.type === "record" || selection.type === "create" ? selection.owner : selection;
          const route = owner.type === "view" ? owner.route : undefined;
          const systemView = route?.section === "tickets" && route.source !== "workspace";
          const id = systemView ? route.id : owner.type === "view" ? owner.id : undefined;
          const view = id
            ? systemView
              ? createTicketDefaultWorkspace().views[id]
              : controller.workspace.views[id]
            : undefined;
          return view
            ? {
                ...view,
                id: systemView ? `tickets/${id}` : view.id,
                section: "Saved view",
                icon: ticketEntity.icon,
                content: TicketMasterDetailView,
                commands: TicketViewCommands,
              }
            : undefined;
        },
      },
    });
    context.registerExtension({
      point: topBarContributions,
      id: "ticket-workspace-commands",
      description: "Displays ticket workspace commands",
      value: { id: shellContributionId("ticket-workspace-commands"), order: 0, component: TicketTopBarCommands },
    });
    context.registerExtension({
      point: shellOverlays,
      id: "ticket-workspace-overlays",
      description: "Displays ticket workspace overlays and announcements",
      value: { id: shellContributionId("ticket-workspace-overlays"), order: 0, component: TicketOverlays },
    });
  },
});
