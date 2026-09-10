import { Show } from "solid-js";

import { plugin } from "../../base/plugin-registry";
import { IconButton } from "../../components/IconButton";
import {
  applicationProviders,
  navigationSections,
  shellOverlays,
  topBarContributions,
  viewResolvers,
  shellContributionId,
} from "../core/shell/contribution";
import { SavedViewCommands, SavedViewContent } from "../core/saved-views/SavedViewContent";
import { SavedViewNavigation } from "../core/saved-views/SavedViewNavigation";
import { ViewEditor } from "./saved-views/ViewEditor";
import { ticketEntity } from "./entities/ticket-entity";
import { entityDescriptions } from "../core/entities/entity-registry";
import { savedViewDefaults, savedViewDefaultsContributionId } from "../core/saved-views/contribution";
import { useWorkspace, WorkspaceProvider } from "../core/saved-views/controller";
import { createTicketDefaultWorkspace } from "./saved-views/ticket-default-views";
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
      point: applicationProviders,
      id: "ticket-workspace-provider",
      description: "Provides ticket workspace state",
      value: { id: shellContributionId("ticket-workspace-provider"), order: 0, component: WorkspaceProvider },
    });
    context.registerExtension({
      point: navigationSections,
      id: "ticket-navigation",
      description: "Displays saved ticket views",
      value: { id: shellContributionId("ticket-navigation"), order: 0, component: SavedViewNavigation },
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
          const id =
            selection.type === "view"
              ? selection.id
              : (selection.type === "record" || selection.type === "create") && selection.owner.type === "view"
                ? selection.owner.id
                : undefined;
          const view = id ? controller.workspace.views[id] : undefined;
          return view
            ? {
                ...view,
                section: "Saved view",
                icon: ticketEntity.icon,
                content: SavedViewContent,
                commands: SavedViewCommands,
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
