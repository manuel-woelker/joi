import { SavedViewContent } from "../components/SavedViewContent";
import { TicketDetail } from "./TicketDetail";
import styles from "./TicketWorkspaceContent.module.css";

export function TicketWorkspaceContent(props: { ticketId: string }) {
  return (
    <div class={styles.layout}>
      <div class={styles.tablePane}>
        <SavedViewContent />
      </div>
      <aside class={styles.detailPane} aria-label="Ticket details">
        <TicketDetail ticketId={props.ticketId} />
      </aside>
    </div>
  );
}
